// This function decrypts Rails ActiveSupport::MessageEncryptor encrypted values.
// See signing_key_service.rb#encryptor in the console Rails app
// Load the *exact same* key, decoded from Base64
import * as crypto from "crypto";

export function decryptRailsMessageEncryptor(payload: string, encryptionKey: Buffer): string | null {
  try {
    const [encryptedDataB64, ivB64, authTagB64] = payload.split("--");
    if (!encryptedDataB64 || !ivB64 || !authTagB64) {
      throw new Error("Invalid payload format. Expected data--iv--tag");
    }

    // Decode all parts from Base64 to Buffers
    const encryptedData = Buffer.from(encryptedDataB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");

    // Create the GCM decipher
    // Note: The IV length from Rails MessageEncryptor is 12 bytes, which is standard.
    // IMPORTANT: This cipher should be the same as in the Rails app.
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);

    // Set the authentication tag. This is a *critical* step.
    // The crypto module will verify this tag during decryption.
    decipher.setAuthTag(authTag);

    // Decrypt the data
    const decryptedBuffer = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    const decrypted = decryptedBuffer.toString("utf8");

    // 7. Success! Parse and return the value.
    // JASIM note: I thought this JSON.parse is not needed, because we're saving a string directly, but it ain't the case,
    // it seems MessageEncryptor itself does a JSON dump before encrypting. The string has double-quotes around it (like when a
    // string is JSON serialized). So we need this JSON.parse here. Don't change.
    return JSON.parse(decrypted);
  } catch (err) {
    // This catch block will execute if:
    // 1. The payload is malformed.
    // 2. The key is wrong.
    // 3. The data was tampered with (auth tag mismatch).
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Decryption failed:", errorMessage);
    return null;
  }
}
