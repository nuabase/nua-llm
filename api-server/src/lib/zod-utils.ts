// returns null if parse is success; error message string otherwise
import { ZodError } from "zod";

export function getErrorMessageFromZodParse(zError: ZodError) {
  const errors = zError.issues
    .map(
      (issue: any) => `${issue.path.join(".") || "payload"} ${issue.message}`,
    )
    .join(", ");
  return errors;
}
