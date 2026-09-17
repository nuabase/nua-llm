import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { AgentInvocation, AgentProcessResult } from "./adapters/types";

// Grace period between SIGINT and SIGKILL. Claude Code only prints its result
// on SIGINT; SIGTERM makes it exit without output.
const KILL_GRACE_MS = 2000;

export type RunInvocationOptions = {
  binaryPath: string;
  invocation: AgentInvocation;
  timeoutMs: number;
  /** Env var names removed from the child's environment. */
  unsetEnv?: string[];
};

/**
 * Runs one CLI invocation in a fresh temporary directory, so the agent sees no
 * project files, hooks, MCP config, or instructions, and removes the directory
 * afterwards. Rejects only when the process cannot be started.
 */
export async function runInvocation(options: RunInvocationOptions): Promise<AgentProcessResult> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "nua-local-agent-"));

  try {
    for (const file of options.invocation.files ?? []) {
      fs.writeFileSync(path.join(workDir, file.name), file.content);
    }

    const result = await spawnAndCollect(options, workDir);

    for (const name of options.invocation.outputFiles ?? []) {
      const filePath = path.join(workDir, name);
      result.outputFiles[name] = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, "utf8")
        : undefined;
    }
    return result;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function spawnAndCollect(options: RunInvocationOptions, cwd: string): Promise<AgentProcessResult> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of options.unsetEnv ?? []) {
    delete env[name];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(options.binaryPath, options.invocation.args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGINT");
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      const reason = error.code === "ENOENT" ? "not found" : error.message;
      reject(new Error(`Could not start ${options.binaryPath}: ${reason}`));
    });

    child.on("close", (exitCode: number | null) => {
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut,
        outputFiles: {},
      });
    });

    // The child may exit before reading stdin (e.g. a bad flag); ignore EPIPE.
    child.stdin.on("error", () => undefined);
    child.stdin.end(options.invocation.stdin);
  });
}

/** Finds an executable on PATH, honouring PATHEXT on Windows. */
export function findOnPath(binaryName: string): string | null {
  const isWindows = process.platform === "win32";
  const extensions = isWindows
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)
    : [""];
  // Prefer native executables over shims on Windows.
  if (isWindows) {
    extensions.sort((a, b) => Number(b.toUpperCase() === ".EXE") - Number(a.toUpperCase() === ".EXE"));
  }

  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, binaryName + ext);
      try {
        if (fs.statSync(candidate).isFile()) {
          if (!isWindows) fs.accessSync(candidate, fs.constants.X_OK);
          return candidate;
        }
      } catch {
        // Not here, or not executable.
      }
    }
  }
  return null;
}
