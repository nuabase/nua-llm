// Prints the release state of this repository as one JSON object on stdout,
// for the release train in ../sapporta-devtools. Only `nuabase` (nua-client)
// is published; it bundles nua-llm-core, so changes to either count.
//
// This script only reads. It never commits, pushes or pulls.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = join(repoDir, "nua-client");
const changesetDir = join(repoDir, ".changeset");
const trackedPaths = ["nua-client", "nua-llm-core"];
const bumpRank = { patch: 1, minor: 2, major: 3 };

function git(args) {
  return execFileSync("git", args, { cwd: repoDir, encoding: "utf8" });
}

function readClientPackage() {
  return JSON.parse(readFileSync(join(clientDir, "package.json"), "utf8"));
}

// Asks npm whether name@version exists. A 404 means "not published"; every
// other failure is an error, because guessing would make the train skip or
// repeat a publish.
function isPublished(name, version) {
  try {
    const out = execFileSync("npm", ["view", `${name}@${version}`, "version", "--json"], {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // npm prints nothing (or an empty value) for a missing version of an
    // existing package.
    const trimmed = out.trim();
    if (trimmed === "") return false;
    const value = JSON.parse(trimmed);
    return Array.isArray(value) ? value.includes(version) : value === version;
  } catch (error) {
    const text = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (text.includes("E404")) return false;
    throw new Error(`npm view ${name}@${version} failed:\n${text.trim() || error.message}`);
  }
}

// The highest bump that any pending changeset records for the package.
function pendingBump(name) {
  let files;
  try {
    files = readdirSync(changesetDir);
  } catch {
    return null;
  }

  let best = null;
  for (const file of files) {
    if (!file.endsWith(".md") || file === "README.md") continue;
    const text = readFileSync(join(changesetDir, file), "utf8");
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) continue;

    for (const line of match[1].split(/\r?\n/)) {
      const entry = line.match(/^\s*["']?([^"':]+)["']?\s*:\s*(patch|minor|major)\s*$/);
      if (!entry || entry[1].trim() !== name) continue;
      const bump = entry[2];
      if (best === null || bumpRank[bump] > bumpRank[best]) best = bump;
    }
  }
  return best;
}

// The commit of the last release. Subjects are matched here rather than with
// `git log --grep`, which also matches lines in commit bodies.
function lastReleaseCommit() {
  const commits = git(["log", "--format=%H%x09%s"])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      return { hash: line.slice(0, tab), subject: line.slice(tab + 1) };
    });

  const versionCommit = commits.find((c) => c.subject.startsWith("Version packages"));
  if (versionCommit) return versionCommit.hash;

  const legacyRelease = commits.find((c) => /^Release \d+\.\d+\.\d+/.test(c.subject));
  return legacyRelease ? legacyRelease.hash : null;
}

// Commits since the last release that touch the published code, leaving out
// commits that only change a CHANGELOG.md.
function unnamedChanges() {
  const marker = lastReleaseCommit();
  const range = marker ? `${marker}..HEAD` : "HEAD";
  const out = git(["log", "--format=%x00%h%x09%s", "--name-only", range, "--", ...trackedPaths]);

  return out
    .split("\0")
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const [header, ...rest] = chunk.split("\n");
      const tab = header.indexOf("\t");
      return {
        hash: header.slice(0, tab),
        subject: header.slice(tab + 1),
        files: rest.map((f) => f.trim()).filter(Boolean),
      };
    })
    .filter((commit) => !commit.files.every((f) => f.split("/").pop() === "CHANGELOG.md"))
    .map(({ hash, subject }) => ({ hash, subject }));
}

function main() {
  const pkg = readClientPackage();
  const bump = pendingBump(pkg.name);

  const status = {
    packages: [
      {
        name: pkg.name,
        version: pkg.version,
        published: isPublished(pkg.name, pkg.version),
        dependencies: [
          ...new Set([
            ...Object.keys(pkg.dependencies ?? {}),
            ...Object.keys(pkg.peerDependencies ?? {}),
          ]),
        ],
        pendingBump: bump,
        unnamedChanges: bump === null ? unnamedChanges() : [],
      },
    ],
  };

  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
