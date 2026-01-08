import { createClient } from "redis";
import { config } from "./config";

// Configuration for the Redis connection from centralized config

// Create a new Redis client instance using node-redis.
// node-redis uses a single connection by default, but commands are pipelined.
// For connection pooling for blocking commands, node-redis offers createClientPool.
// For general use, a single client is often sufficient and efficient.
const redisClient = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
    // connectTimeout: 5000, // Example: 5 seconds
    // You can add other socket options here, e.g., tls
  },
  password: config.redis.password,
  // database: 0, // Specify DB number if not default
});

redisClient.on("ready", () => {
  console.log(
    `Redis client ready, connected to ${config.redis.host}:${config.redis.port}`,
  );
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err);
  // node-redis will attempt to reconnect automatically on many types of errors.
});

// Initiate the connection.
// Commands can be queued before the connection is fully established.
redisClient.connect().catch((err) => {
  console.error("Failed to connect to Redis on startup:", err);
  // Handle initial connection failure, e.g., log and exit, or retry logic.
});

// Export the singleton client instance
export default redisClient;
