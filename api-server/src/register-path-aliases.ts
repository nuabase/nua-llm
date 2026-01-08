import Module from "module";
import path from "path";

// Simple runtime alias resolver for CommonJS requires.
//
// This is needed because we want to use tsconfig-style aliases ("#lib/...", etc.) rather than
// relative paths ("../lib/...", etc.), and while TypeScript supports this, Node.js doesn't.
// We could use tsconfig-paths npm library, or the lighter-weight https://github.com/ilearnio/module-alias
// but this is just enough and fit for our purpose. Also, Node.js has a subpath import, but
// it seems to need exact filename mapping rather than just pointing to a directory.

// Here we monkey-patch the default Node.js _resolveFilename function and expands file names that
// start with the alias, to its full path.

const aliasRoots: Record<string, string> = {
  "#bg-tasks/": path.resolve(__dirname, "bg-tasks"),
  "#handlers/": path.resolve(__dirname, "handlers"),
  "#lib/": path.resolve(__dirname, "lib"),
  "#llm_authorization/": path.resolve(__dirname, "llm_authorization"),
  "#middleware/": path.resolve(__dirname, "middleware"),
  "#modules/": path.resolve(__dirname, "modules"),
  "#types/": path.resolve(__dirname, "types"),
};

const originalResolveFilename = (Module as any)._resolveFilename as (
  request: string,
  parent: any,
  isMain?: boolean,
  options?: any,
) => string;

function resolveAlias(request: string): string | null {
  for (const prefix of Object.keys(aliasRoots)) {
    if (request.startsWith(prefix)) {
      const rest = request.slice(prefix.length);
      const targetDir = aliasRoots[prefix];
      // Build an absolute path inside dist
      return path.join(targetDir, rest);
    }
  }
  return null;
}

// Monkey-patch the resolver once
if (!(global as any).__NUA_ALIAS_RESOLVER_PATCHED__) {
  (global as any).__NUA_ALIAS_RESOLVER_PATCHED__ = true;
  (Module as any)._resolveFilename = function (
    request: string,
    parent: any,
    isMain?: boolean,
    options?: any,
  ) {
    const rewritten = resolveAlias(request);
    if (rewritten) {
      try {
        return originalResolveFilename.call(
          this,
          rewritten,
          parent,
          isMain,
          options,
        );
      } catch (_) {
        // Fall through to default if our rewrite failed
      }
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}
