// A helper to safely extract an error message from a caught exception.
function getErrorMessageFromException(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// Define the return types for our helper for strong type-safety.
type NuaFetchSuccess = {
  ok: true;
  response: Response;
};

type NuaFetchError = {
  ok: false;
  error: string; // A pre-formatted, comprehensive error message
};

type NuaFetchResult = NuaFetchSuccess | NuaFetchError;

/**
 * Wraps the native fetch API to provide a single, consistent way of handling
 * both network errors and non-2xx HTTP responses.
 *
 * @param url The URL to fetch.
 * @param options The standard fetch options.
 * @returns A promise that resolves to a NuaFetchResult object.
 */
export async function nuaFetch(
  url: string | URL,
  options?: RequestInit,
): Promise<NuaFetchResult> {
  try {
    const response = await fetch(url, options);

    // If the HTTP response is not ok (e.g., 404, 500), treat it as an error.
    if (!response.ok) {
      const responseBody = await response.text();
      // Construct a detailed error message.
      const errorMessage = `API Error: ${response.status} ${response.statusText}. Body: ${responseBody}`;
      return { ok: false, error: errorMessage };
    }

    // If we get here, the request was successful.
    return { ok: true, response };
  } catch (error) {
    // This catches network errors (e.g., DNS resolution failure, server unreachable).
    const networkErrorMessage = `Network Error: ${getErrorMessageFromException(error)}`;
    return { ok: false, error: networkErrorMessage };
  }
}
