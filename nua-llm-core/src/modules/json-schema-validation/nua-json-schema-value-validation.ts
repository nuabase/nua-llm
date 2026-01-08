import { ajvInstances } from "./ajv-instances";

export type ValidationResult = {
  success: boolean;
  data?: object;
  error?: string;
};

/**
 * Creates a validation function for checking JSON data against a schema using AJV.
 * Returns a closure that validates unknown data and returns a typed ValidationResult.
 */
export function buildNuaJsonSchemaValueValidation(
  llmRequestId: string,
  parsedSchema: object,
): (json: object) => ValidationResult {
  const ajv = ajvInstances.getInstanceForSchema(parsedSchema);
  const ajvValidation = ajv.compile(parsedSchema);

  return (json: object): ValidationResult => {
    if (ajvValidation(json)) {
      return { success: true, data: json };
    } else {
      const errors = ajvValidation.errors;
      if (errors) {
        const errString = errors
          .map((err) => `${err.instancePath} ${err.message}`)
          .join(", ");
        return {
          success: false,
          error: errString,
        };
      } else {
        // logger.error(
        //   "unexpected-situation. ajvValidation.errors is empty even though validation failed. llmRequest id: ",
        //   llmRequestId,
        // );
        return { success: false, error: "Unknown validation error" };
      }
    }
  };
}
