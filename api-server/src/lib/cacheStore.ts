import { createRedisCacheStore, CacheStore } from "nua-llm-caching";
import redisClient from "./redisClient";

// Create a shared CacheStore adapter wrapping the Redis client
export const cacheStore: CacheStore = createRedisCacheStore(redisClient);
