import { randomUUID, createHash } from "node:crypto";

import { redis } from "../../config/redis.js";
import { logger } from "../logger/logger.js";

// Short TTL keeps any stale catalog data bounded.
// This is performance caching, NOT strong consistency.
const CACHE_TTL_SECONDS = 20;

// A loader should normally finish much sooner than 3 seconds.
// If lock expires early, another loader may start.
// That means stampede prevention is best-effort.
const LOCK_TTL_MS = 3000;

// If another request is loading the same key,
// poll briefly rather than immediately querying PostgreSQL.
const WAIT_ATTEMPTS = 8;
const WAIT_INTERVAL_MS = 50;

const GENERATION_KEY = "commerce:catalog:generation";

// Release lock ONLY if this request still owns it.
// WITHOUT TOKEN CHECK: An expired lock could be replaced,
// and an old request might delete the new owner's lock.
const RELEASE_LOCK_LUA = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end

  return 0
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A fixed-size digest keeps Redis key lengths bounded.
// No passwords, tokens or private data go into cache keys.
function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// Redis availability is optional for public catalog reads.
// WHY: A Redis outage should not automatically make
// PostgreSQL-backed public product listing unavailable.
async function safeRedis(operation, fallback) {
  try {
    return await operation();
  } catch (error) {
    logger.warn({ err: error }, "Catalog cache unavailable; using database");

    return fallback;
  }
}

// Catalog generation is a namespace version.
//
// WHY: Updating ANY category/product changes this generation.
// New reads use NEW cache keys; old keys expire naturally.
//
// WITHOUT INVALIDATION: Updated price, category state or
// archived products could remain visible until TTL expiry.
export async function invalidateCatalogCache() {
  await safeRedis(() => redis.incr(GENERATION_KEY), null);
}

// Current cache namespace.

async function getGeneration() {
  return safeRedis(async () => (await redis.get(GENERATION_KEY)) ?? "0", null);
}

// A cache operation takes its own key identifier and a
// loader function that fetches authoritative PostgreSQL data.
//
// IMPORTANT: Never use this helper for payments, orders,
// authentication, or authoritative stock reservations.
export async function withCatalogCache(identity, loader) {
  const generation = await getGeneration();

  // If Redis is unavailable, query PostgreSQL directly.
  if (generation === null) {
    return loader();
  }

  const key = `commerce:catalog:v${generation ?? "0"}:${digest(identity)}`;
  const lockKey = `${key}:lock`;

  // 1. Try Redis first.
  const cached = await safeRedis(() => redis.get(key), null);

  if (cached !== null) {
    try {
      return JSON.parse(cached);
    } catch {
      // Corrupt cache value isn't a reason to fail the API.
      // The authoritative data still exists in PostgreSQL.
      await safeRedis(() => redis.del(key), null);
    }
  }

  // 2. Try to become the single loader for this key.
  const token = randomUUID();

  const acquired = await safeRedis(
    () => redis.set(lockKey, token, "PX", LOCK_TTL_MS, "NX"),
    null,
  );

  // 3. Another request owns the lock.
  if (acquired !== "OK") {
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
      await sleep(WAIT_INTERVAL_MS);

      const value = await safeRedis(() => redis.get(key), null);

      if (value !== null) {
        try {
          return JSON.parse(value);
        } catch {
          // Invalid cache entries are ignored.
        }
      }
    }

    // Redis issue or loader took too long.
    // Serve from PostgreSQL rather than blocking forever.
    return loader();
  }

  // 4. We own the lock: load data from PostgreSQL.
  try {
    const data = await loader();

    // Generation may have changed while SQL was executing.
    // WHY: Avoid filling the NEW namespace using OLD data.
    //
    // A race around DB commit / invalidation can still cause
    // up to CACHE_TTL_SECONDS of staleness. This design
    // deliberately provides bounded eventual consistency.
    const currentGeneration = await getGeneration();

    if (currentGeneration === generation) {
      await safeRedis(
        () => redis.set(key, JSON.stringify(data), "EX", CACHE_TTL_SECONDS),
        null,
      );
    }

    return data;
  } finally {
    // Always release OUR lock, even if SQL throws.
    await safeRedis(
      () => redis.eval(RELEASE_LOCK_LUA, 1, lockKey, token),
      null,
    );
  }
}
