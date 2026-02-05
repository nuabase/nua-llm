import { resolveConfigValue } from './env';

const isBrowserEnvironment = (): boolean => typeof window !== 'undefined' && !!window.document;

const isLocalhost = (): boolean => {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
};

export type AuthConfig = {
  apiKey?: string;
  fetchToken?: () => Promise<string>;
  dangerouslyAllowBrowserApiKeyInLocalhost?: boolean;
};

export class AuthTokenManager {
  private readonly apiKey?: string;
  private readonly fetchToken?: () => Promise<string>;
  private apiToken?: string;
  private pendingTokenPromise?: Promise<string>;

  constructor(config: AuthConfig) {
    this.apiKey = resolveConfigValue(config, 'apiKey', 'NUABASE_API_KEY') || undefined;
    this.fetchToken = config.fetchToken;

    if (this.apiKey && this.fetchToken) {
      throw new Error('Provide either an apiKey or a fetchToken function, but not both.');
    }

    if (!this.apiKey && !this.fetchToken) {
      throw new Error(
        'Authentication is required. Provide config.apiKey/NUABASE_API_KEY or a fetchToken function.'
      );
    }

    if (this.apiKey && isBrowserEnvironment()) {
      const allowedLocally = config.dangerouslyAllowBrowserApiKeyInLocalhost && isLocalhost();
      if (!allowedLocally) {
        throw new Error(
          'found config.apiKey. It is a private secret that must only be used in server environments.'
        );
      }
    }
  }

  async getToken(): Promise<string> {
    if (this.apiKey) {
      return this.apiKey;
    }

    if (!this.fetchToken) {
      throw new Error('Unable to resolve API token because no fetchToken function is configured.');
    }

    if (this.apiToken) {
      return this.apiToken;
    }

    if (!this.pendingTokenPromise) {
      this.pendingTokenPromise = this.fetchToken()
        .then((token) => {
          if (!token) {
            throw new Error('fetchToken must resolve a non-empty API token.');
          }

          this.apiToken = token;

          return token;
        })
        .finally(() => {
          this.pendingTokenPromise = undefined;
        });
    }

    return this.pendingTokenPromise;
  }
}
