import * as fs from "node:fs";
import * as path from "node:path";

// The main entry point is bundled into browser code, so nothing it reaches may
// import Node built-ins. Only the "local-agent" entry point may.

const SRC = path.join(__dirname, "..");

function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  return [...source.matchAll(/(?:import|export)\s[^"']*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

function resolveRelative(fromFile: string, specifier: string): string {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
}

/** Every Node built-in reachable from `entry`, with the file that imports it. */
function nodeBuiltinsReachableFrom(entry: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const specifier of importsOf(file)) {
      if (specifier.startsWith("node:")) {
        found.push(`${path.relative(SRC, file)} imports ${specifier}`);
      } else if (specifier.startsWith(".")) {
        visit(resolveRelative(file, specifier));
      }
    }
  };
  visit(entry);
  return found;
}

describe("entry points", () => {
  it("keeps Node built-ins out of the main entry point", () => {
    expect(nodeBuiltinsReachableFrom(path.join(SRC, "index.ts"))).toEqual([]);
  });

  it("finds the Node built-ins the local-agent entry point uses", () => {
    expect(nodeBuiltinsReachableFrom(path.join(SRC, "local-agent.ts"))).toContain(
      "modules/engine/local-agent/process-runner.ts imports node:child_process",
    );
  });
});
