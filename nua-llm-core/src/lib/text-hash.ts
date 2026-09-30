const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * A 64-bit FNV-1a hash of the text, as 16 hex digits. Fast and synchronous, for keys that
 * group requests; not for anything security-sensitive.
 */
export function textHash(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}
