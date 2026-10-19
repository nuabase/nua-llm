export type NuabaseError = {
  error: string;
  isError: true;
  isSuccess?: false;
};

export async function parseErrorResponse(
  response: Response,
  urlPath: string
): Promise<NuabaseError> {
  const fallbackMessage = `Request to ${urlPath} failed with status ${response.status}${
    response.statusText ? ` ${response.statusText}` : ''
  }`;

  let responseBody = '';

  try {
    responseBody = (await response.text()).trim();
  } catch {
    return { error: fallbackMessage, isError: true };
  }

  if (!responseBody) {
    return { error: fallbackMessage, isError: true };
  }

  const parsedBody = safeParseJson(responseBody);

  if (parsedBody && typeof parsedBody === 'object') {
    const errorMessage = extractErrorMessage(parsedBody as Record<string, unknown>);
    if (errorMessage) {
      return { error: errorMessage, isError: true };
    }
  }

  return { error: responseBody, isError: true };
}

function safeParseJson(payload: string): undefined | unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

function extractErrorMessage(body: Record<string, unknown>): string | undefined {
  const parts: string[] = [];

  const error = body['error'];
  if (typeof error === 'string' && error.trim()) {
    parts.push(error.trim());
  }

  const message = body['message'];
  if (typeof message === 'string' && message.trim()) {
    parts.push(message.trim());
  }

  if (parts.length === 0) return undefined;

  // eg: "Error: Unauthorized. Invalid API key/JWT token"
  return parts.join('. ');
}
