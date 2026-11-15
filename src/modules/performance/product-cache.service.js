import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { pool } from "../../config/database.js";
import { getRedisClient } from "../../config/redis.js";
import { getProductCacheKey } from "../products/product-cache.js";

// Keep product data cached for 30 seconds.
const CACHE_TTL_SECONDS = 30;

// If the loader crashes, Redis automatically expires the lock.
const LOCK_TTL_MS = 5000;

// Wait at most 2 seconds for another process to fill the cache.
const MAX_WAIT_MS = 2000;
const POLL_INTERVAL_MS = 100;

// Only for this learning experiment.
// Make DB loading slower so overlapping requests are easy to observe.
const DEMO_DELAY_MS = 300;

// One pending Promise for each product within this Node.js process.
const pendingRequests = new Map();

// Count actual product SELECT queries for our experiment.
let databaseReads = 0;

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Query PostgreSQL and count the database read.
const readProductFromDatabase = async (productId) => {
  // Simulate an expensive query without blocking the Event Loop.
  await sleep(DEMO_DELAY_MS);

  databaseReads += 1;

  const result = await pool.query(
    `SELECT *
     FROM products
     WHERE id = $1`,
    [productId],
  );

  return result.rows[0] ?? null;
};

// Release a lock only if we still own it.
const RELEASE_LOCK_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end

  return 0
`;

// Perform the actual cache-aside loading.
const loadProduct = async (productId) => {
  const cacheKey = getProductCacheKey(productId);
  const lockKey = `${cacheKey}:lock`;

  let redis;

  // STEP 1: Check Redis cache.
  try {
    redis = await getRedisClient();

    const cached = await redis.get(cacheKey);

    if (cached !== null) {
      return {
        product: JSON.parse(cached),
        source: "REDIS",
      };
    }
  } catch (error) {
    // Redis is unavailable. PostgreSQL remains our source of truth.
    console.error("Redis read failed:", error.message);

    return {
      product: await readProductFromDatabase(productId),
      source: "POSTGRESQL_FALLBACK",
    };
  }

  // STEP 2: Try to become the single cache loader.
  const token = randomUUID();

  let lockAcquired = false;

  try {
    const reply = await redis.set(lockKey, token, {
      NX: true,
      PX: LOCK_TTL_MS,
    });

    lockAcquired = reply === "OK";
  } catch (error) {
    console.error("Redis lock failed:", error.message);

    return {
      product: await readProductFromDatabase(productId),
      source: "POSTGRESQL_FALLBACK",
    };
  }

  if (lockAcquired) {
    try {
      // STEP 3: Only the lock owner loads from PostgreSQL.
      const product = await readProductFromDatabase(productId);

      // Save positive results in Redis.
      if (product) {
        try {
          await redis.set(cacheKey, JSON.stringify(product), {
            EX: CACHE_TTL_SECONDS,
          });
        } catch (error) {
          console.error("Redis cache write failed:", error.message);
        }
      }

      return {
        product,
        source: "POSTGRESQL_LOCK_OWNER",
      };
    } finally {
      // Always attempt to release the lock.
      try {
        await redis.eval(RELEASE_LOCK_SCRIPT, {
          keys: [lockKey],
          arguments: [token],
        });
      } catch (error) {
        console.error("Redis lock release failed:", error.message);
      }
    }
  }

  // STEP 4: Another process owns the lock.
  // Wait briefly for it to populate the cache.
  const deadline = performance.now() + MAX_WAIT_MS;

  while (performance.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const cached = await redis.get(cacheKey);

      if (cached !== null) {
        return {
          product: JSON.parse(cached),
          source: "REDIS_AFTER_WAIT",
        };
      }
    } catch (error) {
      console.error("Redis polling failed:", error.message);
      break;
    }
  }

  // STEP 5: Avoid waiting forever.
  // Fallback reads PostgreSQL without writing the cache.
  return {
    product: await readProductFromDatabase(productId),
    source: "POSTGRESQL_WAIT_TIMEOUT",
  };
};

// Public function called by our Express route.
export const getCachedProduct = async (productId) => {
  const start = performance.now();

  // Same-process Single-Flight:
  // share a pending Promise instead of starting duplicate work.
  const existing = pendingRequests.get(productId);

  if (existing) {
    const result = await existing;

    return {
      product: result.product,
      source: "SINGLE_FLIGHT",
      durationMs: Math.round(performance.now() - start),
    };
  }

  const task = loadProduct(productId);

  pendingRequests.set(productId, task);

  try {
    const result = await task;

    return {
      ...result,
      durationMs: Math.round(performance.now() - start),
    };
  } finally {
    // Remove completed or failed tasks from the Map.
    pendingRequests.delete(productId);
  }
};

// Development-only statistics.
export const getCacheStampedeStats = () => ({
  processId: process.pid,
  databaseReads,
  pendingProducts: pendingRequests.size,
});

// Reset only the local demonstration counter.
export const resetCacheStampedeStats = () => {
  databaseReads = 0;
};
