
// This is the ENCRYPTION_KEY_DB_STORAGE_SIGNING_KEY env variable. Used with ActiveSupport::MessageEncryptor as the key
const ENCRYPTION_KEY_BASE64 = "xrhcG/XQIVJQe1zj7zmCe5SetvZfSQUP/PN65bNz1+Q="
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_BASE64, "base64")

// The third part of the pk_.. signing key full token generated and displayed in the UI in the Console SigningKeyService.
// This is the original value.
const ORIGINAL_PAYLOAD = "zKLNaMBsN8Q0WXkvY2TpYMvk1JZD8cdZZckJ2Uw9w5E";
// This is the value written by Rails into the database, for the above payload.
const ENCRYPTED_PAYLOAD = "0UspvJr1z2r5C7+xmku9SyKuom2fruXXKyLJ5+WPt5deo6SAgAv4mZjHqzw7--LMQ/fKOY3R3mZik9--hcsuBb6inK5SZCIVJApPCw=="

jest.mock("#lib/config", () => ({
  config: {
    encryptionKeyDbStorageSigningKey: ENCRYPTION_KEY_BASE64,
  },
}));

let decryptRailsMessageEncryptor: typeof import("../activesupport-message-encryptor")["decryptRailsMessageEncryptor"];

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ({ decryptRailsMessageEncryptor } = require("../activesupport-message-encryptor"));
});


describe("decryptRailsMessage", () => {
  it("returns the parsed object with a valid payload and key", () => {
    const decrypted = decryptRailsMessageEncryptor(ENCRYPTED_PAYLOAD, ENCRYPTION_KEY);
    expect(decrypted).toEqual(ORIGINAL_PAYLOAD);
  });

  it("fails decryption when ciphertext bytes are modified", () => {
    const [dataB64, ivB64, tagB64] = ENCRYPTED_PAYLOAD.split("--");
    const corruptedBuffer = Buffer.from(dataB64, "base64");
    corruptedBuffer[0] ^= 0xff;
    const corruptedPayload = [
      corruptedBuffer.toString("base64"),
      ivB64,
      tagB64,
    ].join("--");

    const decrypted = decryptRailsMessageEncryptor(corruptedPayload, ENCRYPTION_KEY);

    expect(decrypted).toBeNull();
  });

  it("fails decryption when the key is incorrect", () => {
    const wrongKey = Buffer.from("fedcba9876543210fedcba9876543210");

    const decrypted = decryptRailsMessageEncryptor(ENCRYPTED_PAYLOAD, wrongKey);

    expect(decrypted).toBeNull();
  });

  it("fails when the payload format is invalid", () => {
    const decrypted = decryptRailsMessageEncryptor("invalid", ENCRYPTION_KEY);

    expect(decrypted).toBeNull();
  });

  it("fails for empty payload segments", () => {
    const STUB_IV = Buffer.alloc(12, 7);
    const emptySegmentPayload = ["", STUB_IV.toString("base64"), ""].join("--");

    const decrypted = decryptRailsMessageEncryptor(emptySegmentPayload, ENCRYPTION_KEY);

    expect(decrypted).toBeNull();
  });

  it("fails when provided with an empty encryption key", () => {
    const decrypted = decryptRailsMessageEncryptor(ENCRYPTED_PAYLOAD, Buffer.alloc(0));

    expect(decrypted).toBeNull();
  });
});
