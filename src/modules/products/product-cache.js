import { getRedisClient } from "../../config/redis.js";

// Keep the exact same key format as our caching experiment.
export const getProductCacheKey = (productId) => {
  return `commerceflow:product:${productId}`;
};

// Remove the cached copy of a product after a successful DB write.
export const invalidateProductCache = async (productId) => {
  try {
    const redis = await getRedisClient();

    const key = getProductCacheKey(productId);

    // DEL returns 1 when the key existed and was removed.
    // It returns 0 when the key was already absent.
    const deleted = await redis.del(key);

    return {
      success: true,
      deleted: deleted === 1,
    };
  } catch (error) {
    // A successful PostgreSQL update must not be reported
    // as failed only because cache invalidation failed.
    console.error("Product cache invalidation failed:", {
      productId,
      error: error.message,
    });

    return {
      success: false,
      deleted: false,
    };
  }
};
