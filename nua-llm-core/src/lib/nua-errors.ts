export type NuaValidationError = { kind: "validation-error"; message: string };

export const isNuaValidationError = (a: unknown): a is NuaValidationError => {
  return (
    typeof a == "object" &&
    a != null &&
    "kind" in a &&
    a.kind == "validation-error"
  );
};
