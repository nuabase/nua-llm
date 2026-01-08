export const nullToUndefined = <T>(value: T | null): T | undefined =>
  value ?? undefined;

/**
 * A mapped type that takes an object type `T` and produces a new type
 * where `null` is removed from the type of each property.
 * e.g., { a: string | null, b: number } becomes { a: string, b: number }
 */
type NullSanitized<T> = {
  [P in keyof T]: Exclude<T[P], null>;
};

export function nullToUndefined_forObject<T extends object>(
  obj: T | null | undefined,
): NullSanitized<T> | undefined {
  // Checks for both null and undefined (in Node.js, `undefined == null` is true), since no type coercion in double-equals
  if (obj == null) {
    return undefined;
  }

  const newObj = { ...obj };

  for (const key in newObj) {
    if (newObj[key] === null) {
      // We use a type assertion here because we are modifying the object's shape
      // in a way that TypeScript can't track inside a loop.
      (newObj as any)[key] = undefined;
    }
  }

  // Assert the return type, telling TypeScript we have fulfilled the contract of `Sanitized<T>`.
  return newObj as NullSanitized<T>;
}
