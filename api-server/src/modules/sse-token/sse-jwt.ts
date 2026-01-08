import * as jwt from "jsonwebtoken";
import { createClient, RedisClientType } from "redis";

// --- Configuration Interface ---
export interface JwtValidatorConfig {
  /** Corresponds to Rails' JWT_SECRET_KEY */
  secretKey: string;
  /** Corresponds to Rails' JWT_ALGORITHM (e.g., 'HS256') */
  algorithm: jwt.Algorithm;
  /** Corresponds to Rails' JWT_ISSUER */
  issuer: string;
  /** Corresponds to Rails' JWT_AUDIENCE */
  audience: string;
  /** An initialized Redis client instance */
  redisClient: RedisClientType | any; // Use `any` for flexibility or a more specific type
  /** Corresponds to Rails' REDIS_BLACKLIST_PREFIX (e.g., "blacklist:jwt:") */
  redisBlacklistPrefix: string;
}

export interface ValidationOutcome {
  /** Indicates if the token is valid and the user is authenticated */
  isAuthenticated: boolean;
  /** Populated from the 'sub' claim if authentication succeeds */
  userId?: string;
  /** Error message if authentication fails */
  error?: string;
  /** The 'jti' claim, useful for logging or if the token is invalid */
  jti?: string;
}

// --- Intermediate Result Types for Internal Logic ---

/**
 * Result of attempting to verify JWT signature and standard claims.
 */
interface VerifiedJwtResult {
  isValid: boolean;
  payload?: jwt.JwtPayload; // Present if isValid is true
  error?: string; // Present if isValid is false
}

/**
 * Result of validating essential claims (sub, jti) from a verified payload.
 */
interface EssentialClaimsValidationResult {
  isValid: boolean;
  userId?: string; // Present if isValid is true
  jti?: string; // Present if isValid is true and jti claim exists
  error?: string; // Present if isValid is false
}

interface BlacklistCheckResult {
  isCheckedSuccessfully: boolean; // True if the Redis check was performed without operational error
  isBlacklisted?: boolean; // Present if isCheckedSuccessfully is true
  error?: string; // Present if isCheckedSuccessfully is false (e.g., Redis connection error)
}

export class JwtValidator {
  private readonly config: JwtValidatorConfig;

  constructor(config: JwtValidatorConfig) {
    if (!config.secretKey) {
      throw new Error("JwtValidatorConfig: secretKey is required.");
    }
    if (!config.algorithm) {
      throw new Error("JwtValidatorConfig: algorithm is required.");
    }
    if (!config.issuer) {
      throw new Error("JwtValidatorConfig: issuer is required.");
    }
    if (!config.audience) {
      throw new Error("JwtValidatorConfig: audience is required.");
    }
    if (!config.redisClient) {
      throw new Error("JwtValidatorConfig: redisClient is required.");
    }
    if (
      config.redisBlacklistPrefix === undefined ||
      config.redisBlacklistPrefix === null
    ) {
      // Allow empty string if explicitly provided, but not undefined/null
      throw new Error("JwtValidatorConfig: redisBlacklistPrefix is required.");
    }
    this.config = config;
  }

  private _decodeTokenForJti(tokenString: string): { jti?: string } {
    try {
      const decoded = jwt.decode(tokenString);
      if (decoded && typeof decoded === "object" && decoded.jti) {
        return { jti: String(decoded.jti) };
      }
      return { jti: undefined };
    } catch {
      // Handles cases where tokenString is not a valid JWT structure for decoding
      return { jti: undefined };
    }
  }

  private _verifySignatureAndStandardClaims(
    tokenString: string,
  ): VerifiedJwtResult {
    try {
      const payload = jwt.verify(tokenString, this.config.secretKey, {
        algorithms: [this.config.algorithm],
        issuer: this.config.issuer,
        audience: this.config.audience,
      }) as jwt.JwtPayload;
      return { isValid: true, payload };
    } catch (error: any) {
      let errorMessage = "Invalid token"; // Default message
      if (error instanceof jwt.TokenExpiredError) {
        errorMessage = "Token expired";
      } else if (error instanceof jwt.JsonWebTokenError) {
        // Specific messages based on error type
        if (error.message.includes("invalid signature"))
          errorMessage = "Invalid signature";
        else if (error.message.includes("jwt issuer invalid"))
          errorMessage = "Issuer mismatch";
        else if (error.message.includes("jwt audience invalid"))
          errorMessage = "Audience mismatch";
        else if (error.message.includes("invalid algorithm"))
          errorMessage = "Invalid algorithm";
        else if (error.message.includes("jwt malformed"))
          errorMessage = "Token malformed";
        else if (
          error.message.includes("Unexpected token") &&
          error.message.includes("JSON")
        )
          errorMessage = "Token malformed (payload not JSON)";
        else errorMessage = `Token validation error: ${error.message}`; // Fallback to library's message for other JWT errors
      } else {
        // For truly unexpected errors not subclassed from JsonWebTokenError (should be rare)
        errorMessage =
          "An unexpected error occurred during token verification.";
        console.error("Unexpected error during JWT verification:", error); // Log unexpected internal errors
      }
      return { isValid: false, error: errorMessage };
    }
  }

  private _validateEssentialClaims(
    payload: jwt.JwtPayload,
  ): EssentialClaimsValidationResult {
    const jti = payload.jti ? String(payload.jti) : undefined;

    if (!jti) {
      return {
        isValid: false,
        error: "Token missing JTI claim",
        jti: undefined,
      };
    }

    const subClaim = payload.sub;
    if (subClaim === undefined || subClaim === null) {
      return { isValid: false, error: "Token missing SUB claim", jti };
    }

    if (typeof subClaim !== "string") {
      return {
        isValid: false,
        error: "Invalid 'sub' claim format (must be a string).",
        jti,
      };
    }

    return { isValid: true, userId: subClaim, jti };
  }

  /**
   * Checks if the token's JTI is blacklisted in Redis.
   */
  private async _isTokenBlacklisted(
    jti: string,
  ): Promise<BlacklistCheckResult> {
    const redisKey = `${this.config.redisBlacklistPrefix}${jti}`;
    try {
      const exists = await this.config.redisClient.exists(redisKey);
      return { isCheckedSuccessfully: true, isBlacklisted: exists === 1 };
    } catch (redisError: any) {
      console.error(
        `Redis error during blacklist check for JTI ${jti}:`,
        redisError,
      );
      return {
        isCheckedSuccessfully: false,
        error:
          "Could not verify token blacklist status due to a data store error.",
      };
    }
  }

  /**
   * Validates a given JWT string.
   * It performs signature verification, standard claim validation, and a blacklist check
   * by orchestrating calls to specialized helper methods.
   */
  public async validateToken(tokenString: string): Promise<ValidationOutcome> {
    // Attempt to get JTI early for logging, even if other validations fail.
    const initialJtiExtraction = this._decodeTokenForJti(tokenString);
    const jtiForLoggingOnError = initialJtiExtraction.jti;

    // Step 1: Verify Signature and Standard Claims (issuer, audience, expiry, algorithm)
    // This is a pure computation.
    const signatureAndClaimsVerification =
      this._verifySignatureAndStandardClaims(tokenString);
    if (
      !signatureAndClaimsVerification.isValid ||
      !signatureAndClaimsVerification.payload
    ) {
      return {
        isAuthenticated: false,
        error:
          signatureAndClaimsVerification.error || "Token verification failed.",
        jti: jtiForLoggingOnError,
      };
    }
    const verifiedPayload = signatureAndClaimsVerification.payload;

    // Step 2: Validate presence and format of essential claims (sub, jti) from the verified payload.
    // This is a pure computation.
    const essentialClaimsValidation =
      this._validateEssentialClaims(verifiedPayload);
    if (!essentialClaimsValidation.isValid) {
      return {
        isAuthenticated: false,
        error:
          essentialClaimsValidation.error ||
          "Essential claims validation failed.",
        // Use JTI from claims validation if available (e.g., SUB missing but JTI present),
        // otherwise from the initial decode.
        jti: essentialClaimsValidation.jti || jtiForLoggingOnError,
      };
    }

    // At this point, essentialClaimsValidation.userId and essentialClaimsValidation.jti are guaranteed to be valid and present.
    const { userId, jti } = essentialClaimsValidation as {
      userId: string;
      jti: string;
    };

    // Step 3: Check Redis Blacklist (I/O operation)
    const blacklistCheck = await this._isTokenBlacklisted(jti);
    if (!blacklistCheck.isCheckedSuccessfully) {
      // This indicates an operational error with Redis.
      return {
        isAuthenticated: false,
        error:
          blacklistCheck.error || "Failed to check token blacklist status.",
        jti: jti, // We have a valid JTI from the token itself.
      };
    }
    if (blacklistCheck.isBlacklisted) {
      return {
        isAuthenticated: false,
        error: "Token is blacklisted",
        jti: jti,
      };
    }

    // Step 4: Successful Validation - All checks passed
    return {
      isAuthenticated: true,
      userId: userId,
      jti: jti,
    };
  }
}
