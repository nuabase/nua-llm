export function stableStringify(value: unknown): string {
  const seen = new WeakSet();

  const sorter = (_key: string, currentValue: unknown) => {
    if (
      currentValue &&
      typeof currentValue === "object" &&
      !Array.isArray(currentValue)
    ) {
      if (seen.has(currentValue as object)) {
        return currentValue;
      }

      seen.add(currentValue as object);

      return Object.keys(currentValue as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (currentValue as Record<string, unknown>)[key];
          return acc;
        }, {});
    }

    return currentValue;
  };

  return JSON.stringify(value, sorter) ?? "";
}
