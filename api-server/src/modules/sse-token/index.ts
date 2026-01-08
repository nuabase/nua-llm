import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { config } from "#lib/config";
import redisClient from "#lib/redisClient";
import { JwtValidator, ValidationOutcome } from "#modules/sse-token/sse-jwt";
import { User } from "../../models/users-model";

const sseJwtValidator = new JwtValidator({
  secretKey: config.sseJwt.secretKey,
  algorithm: config.sseJwt.algorithm,
  issuer: config.sseJwt.issuer,
  audience: config.sseJwt.audience,
  redisClient,
  redisBlacklistPrefix: config.sseJwt.redisBlacklistPrefix,
});

export interface SseTokenClaims {
  // This is the llm request id, but we want to keep the name as short as possible
  // so the final JWT token length can be kept as small as possible
  rid: string;
}

export function createSseToken(user: User, llmRequestId: string): string {
  const payload: SseTokenClaims = {
    rid: llmRequestId,
  };

  const signOptions: jwt.SignOptions = {
    algorithm: config.sseJwt.algorithm,
    issuer: config.sseJwt.issuer,
    audience: config.sseJwt.audience,
    jwtid: randomBytes(9).toString("base64url"),
    expiresIn: "1h",
    subject: user.id,
  };

  return jwt.sign(payload, config.sseJwt.secretKey, signOptions);
}

export function decodeSseTokenClaims(token: string): SseTokenClaims | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== "object") {
    return null;
  }

  const llmRequestId = decoded.rid;
  if (typeof llmRequestId !== "string" || llmRequestId.length === 0) {
    return null;
  }

  return { rid: llmRequestId };
}

export async function validateSseToken(
  token: string,
): Promise<ValidationOutcome> {
  return sseJwtValidator.validateToken(token);
}

export function getSseJwtValidator(): JwtValidator {
  return sseJwtValidator;
}
