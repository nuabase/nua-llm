export type NuaError = NuaInternalError | NuaValidationError;

export type NuaValidationError = { kind: "validation-error"; message: string };

export const isNuaValidationError = (a: unknown): a is NuaValidationError => {
  return (
    typeof a == "object" &&
    a != null &&
    "kind" in a &&
    a.kind == "validation-error"
  );
};

export type NuaInternalError = { kind: "internal-error"; message: string };

export const isNuaInternalError = (a: unknown): a is NuaInternalError => {
  return (
    typeof a == "object" &&
    a != null &&
    "kind" in a &&
    a.kind == "internal-error"
  );
};

export const isNuaError = (a: unknown): a is NuaError => {
  return (
    typeof a == "object" &&
    a != null &&
    "kind" in a &&
    (a.kind == "internal-error" || a.kind == "validation-error")
  );
};
