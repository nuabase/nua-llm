import { sha256, hashObject } from "../hash";

describe("sha256", () => {
  it("should return consistent hash for same input", () => {
    const hash1 = sha256("hello world");
    const hash2 = sha256("hello world");
    expect(hash1).toBe(hash2);
  });

  it("should return different hashes for different inputs", () => {
    const hash1 = sha256("hello");
    const hash2 = sha256("world");
    expect(hash1).not.toBe(hash2);
  });

  it("should return 64-character hex string", () => {
    const hash = sha256("test");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe("hashObject", () => {
  it("should return consistent hash for equivalent objects", () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 2, a: 1 }; // Different key order
    expect(hashObject(obj1)).toBe(hashObject(obj2));
  });

  it("should return different hashes for different objects", () => {
    const hash1 = hashObject({ a: 1 });
    const hash2 = hashObject({ a: 2 });
    expect(hash1).not.toBe(hash2);
  });

  it("should handle nested objects", () => {
    const obj1 = { outer: { inner: 1 } };
    const obj2 = { outer: { inner: 1 } };
    expect(hashObject(obj1)).toBe(hashObject(obj2));
  });

  it("should handle arrays", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [1, 2, 3];
    expect(hashObject(arr1)).toBe(hashObject(arr2));
  });
});
