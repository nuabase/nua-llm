import { resolveConfigValue } from './env';

const isBrowserEnvironment = (): boolean => typeof window !== 'undefined' && !!window.document;

export const isDevelopmentLikeBrowserEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;

  // If we're dealing with localhost domains, then we're in dev env, and it is allowed to use private API keys
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return true;

  // Node.js / Webpack / Next.js dev env
  if (typeof process !== 'undefined') {
    if (process.env?.NODE_ENV === 'development') {
      return true;
    }
  }

  // No sign of this being a dev environment. We can't allow private API keys, even if the dangerouslyAllow config value is on.
  return false;
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
      // For local development - prototyping browser side apps - using api keys is the easiest way to get started.
      // For that, the config value should suffice. We'll however ensure that the config value has no effect in a
      // server / production environment.
      if (
        !(config.dangerouslyAllowBrowserApiKeyInLocalhost && isDevelopmentLikeBrowserEnvironment())
      )
        throw new Error(
          'found config.apiKey. It is a private secret that must only be used in server environments.'
        );
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
