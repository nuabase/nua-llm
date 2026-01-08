import * as jwt from "jsonwebtoken";

const nodeEnv = process.env.NODE_ENV || "development";

export const config = {
  port: parseInt(process.env.PORT || "3030", 10),
  appBaseUrl: process.env.APP_BASE_URL as string,
  nodeEnv: nodeEnv,
  railsConsoleServerUrl: process.env.RAILS_CONSOLE_SERVER_URL as string,

  pushpinPublishInternalServiceUrl: process.env
    .PUSHPIN_PUBLISH_INTERNAL_SERVICE_URL as string,
  pushpinPublicConsumerUrl: process.env.PUSHPIN_PUBLIC_CONSUMER_URL as string,

  svixWebhookApiKey: process.env.SVIX_WEBHOOK_API_KEY as string,

  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD as string,
    db: parseInt(process.env.REDIS_DB || "0", 10),
  },

  sseJwt: {
    secretKey: process.env.SSE_JWT_SECRET_KEY as string,
    algorithm: "HS256" as jwt.Algorithm,
    issuer: process.env.SSE_JWT_ISSUER as string,
    audience: process.env.SSE_JWT_AUDIENCE as string,
    redisBlacklistPrefix:
      process.env.SSE_JWT_REDIS_BLACKLIST_PREFIX || "jwt_blacklist:",
  },

  authn: {
    generatedBearerApiKeysPepperV1: process.env
      .GENERATED_BEARER_API_KEYS_PEPPER_V1 as string,
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
  },

  llm: {
    groqApiKey: process.env.GROQ_API_KEY as string,
    cerebrasApiKey: process.env.CEREBRAS_API_KEY as string,
    openRouterApiKey: process.env.OPENROUTER_API_KEY as string,
  },

  dbLlmCacheUrl: process.env.DB_LLM_CACHE_URL as string,
  dbLlmMainUrl: process.env.DB_LLM_MAIN_URL as string,
  dbConsoleMainUrl: process.env.DB_CONSOLE_MAIN_URL as string,

  encryptionKeyDbStorageSigningKey: Buffer.from(process.env.ENCRYPTION_KEY_DB_STORAGE_SIGNING_KEY as string, "base64"),
};

// if (!config.jwt.secretKey) {
//   throw new Error("JWT_SECRET_KEY environment variable is required");
// }
//
// if (!config.jwt.issuer) {
//   throw new Error("JWT_ISSUER environment variable is required");
// }
//
// if (!config.jwt.audience) {
//   throw new Error("JWT_AUDIENCE environment variable is required");
// }

validateRequiredConfigProperties([
  "appBaseUrl",
  "pushpinPublishInternalServiceUrl",
  "pushpinPublicConsumerUrl",
  "authn.generatedBearerApiKeysPepperV1",
  "llm.groqApiKey",
  "llm.cerebrasApiKey",
  "llm.openRouterApiKey",
  "dbLlmCacheUrl",
  "dbLlmMainUrl",
  "dbConsoleMainUrl",
  "railsConsoleServerUrl",
  "svixWebhookApiKey",
  "sseJwt.secretKey",
  "sseJwt.issuer",
  "sseJwt.audience",
  "encryptionKeyDbStorageSigningKey"
]);

function validateRequiredConfigProperties(
  // This type represents an array of possible configuration property paths:
  // 1. Direct top-level keys of the config object (keyof typeof config)
  // 2. Nested properties using dot notation (e.g., "jwt.secretKey")
  // The template literal type `${keyof typeof config}.${string}` allows for
  // type-safe nested property access while maintaining TypeScript's type checking
  propertyPaths: Array<
    keyof typeof config | `${keyof typeof config}.${string}`
  >,
) {
  const errorMessages: string[] = [];
  propertyPaths.forEach((path) => {
    const parts = path.toString().split(".");
    let value = config as any;

    for (const part of parts) {
      value = value[part];
    }

    if (!value) {
      const envVar = path
        .toString()
        .split(".")
        .map((s) => s.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase())
        .join(".");

      errorMessages.push(`${envVar} environment variable is required`);
    }
  });

  if (errorMessages.length > 0) {
    throw new Error(errorMessages.join("\n"));
  }
}
