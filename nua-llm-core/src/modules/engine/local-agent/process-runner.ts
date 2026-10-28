import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { EngineOutputListener } from "../llm-engine";
import { AgentInvocation, AgentProcessResult, AgentProcessStop } from "./adapters/types";

// Grace period between SIGINT and SIGKILL. Claude Code only prints its result
// on SIGINT; SIGTERM makes it exit without output.
const KILL_GRACE_MS = 2000;

export type RunInvocationOptions = {
  binaryPath: string;
  invocation: AgentInvocation;
  timeoutMs: number;
  /** Stops the process when it prints nothing for this long. Null for no limit. */
  idleTimeoutMs: number | null;
  /** Gets the process's output as it arrives, as well as the result. */
  onOutput?: EngineOutputListener;
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

    const startedAt = Date.now();
    const stdout: string[] = [];
    const stderr: string[] = [];
    let stopped: AgentProcessStop | null = null;
    let listenerError: unknown;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const stop = (limit: AgentProcessStop["limit"], limitMs: number) => {
      if (stopped) return;
      stopped = { limit, limitMs, afterMs: Date.now() - startedAt };
      clearTimeout(timeoutTimer);
      clearTimeout(idleTimer);
      child.kill("SIGINT");
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
    };
    const resetIdleTimer = () => {
      const idleTimeoutMs = options.idleTimeoutMs;
      if (idleTimeoutMs === null || stopped) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => stop("idle", idleTimeoutMs), idleTimeoutMs);
    };
    const timeoutTimer = setTimeout(() => stop("total", options.timeoutMs), options.timeoutMs);
    resetIdleTimer();

    const collect = (stream: "stdout" | "stderr", chunks: string[]) => (chunk: string) => {
      chunks.push(chunk);
      resetIdleTimer();
      try {
        options.onOutput?.(chunk, stream);
      } catch (error) {
        // A throw here would crash the host process. The listener keeps getting
        // output, and the caller learns of its first failure from the result.
        listenerError ??= error;
      }
    };
    // Decoding here keeps a character split across two chunks whole.
    child.stdout.setEncoding("utf8").on("data", collect("stdout", stdout));
    child.stderr.setEncoding("utf8").on("data", collect("stderr", stderr));

    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeoutTimer);
      clearTimeout(idleTimer);
      clearTimeout(killTimer);
      const reason = error.code === "ENOENT" ? "not found" : error.message;
      reject(new Error(`Could not start ${options.binaryPath}: ${reason}`));
    });

    child.on("close", (exitCode: number | null) => {
      clearTimeout(timeoutTimer);
      clearTimeout(idleTimer);
      clearTimeout(killTimer);
      resolve({
        exitCode,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
        stopped,
        outputFiles: {},
        listenerError,
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
