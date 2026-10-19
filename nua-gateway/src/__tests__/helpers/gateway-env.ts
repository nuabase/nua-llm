// The tests call a running Nuabase API: NUABASE_API_URL (the hosted API by default), with
// the key in NUABASE_API_KEY. Both are read when a test runs, so a missing key fails the
// tests that need it rather than the whole file.

export const TEST_TIMEOUT_MS = 30_000;

export function apiBaseUrl(): string {
  return process.env.NUABASE_API_URL || 'https://api.nuabase.com';
}

/** Headers for calling the Nuabase API with fetch, bypassing the client. */
export function authHeaders(): Record<string, string> {
  const apiKey = process.env.NUABASE_API_KEY;
  if (!apiKey) {
    throw new Error('NUABASE_API_KEY is required for the gateway tests');
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}
