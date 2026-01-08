import * as crypto from "crypto";

// This is the equivalent of ApiKeyService.hmac_sha256 in the Rails console codebase
export function hmacSha256(secret: string, value: string): string {
  return crypto
    .createHmac("sha256", secret) // 1. Initialize HMAC with the algorithm and secret
    .update(value) // 2. Pass in the data to hash
    .digest("hex"); // 3. Get the result as a hexadecimal string
}
