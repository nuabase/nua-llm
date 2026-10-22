import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

import { AGENT_ADAPTERS } from "./adapters";
import { SessionApproval } from "./adapters/types";
import { isLocalAgentId, LocalAgentId } from "./agent-id";
import { findOnPath } from "./process-runner";

/*
 * Starts a coding agent interactively, in the user's project, on a first
 * message the program wrote, for the user to carry on with in a terminal.
 *
 *   startAgentSession({ agent, cwd, prompt, dir })
 *     -> <dir>/<name>.md       the prompt, 0600
 *     -> <dir>/<name>.command  a POSIX shell launcher, 0700
 *     -> on macOS: `open <launcher>` runs it in a new window of the user's
 *        terminal app, which needs no Automation permission; elsewhere the
 *        user runs its command in a terminal
 *
 * No agent CLI reads its first message from a file, and a prompt can't go on
 * a command line as written: it is multi-line and may hold quotes, backticks,
 * backslashes and `$NAMES` the agent must see unexpanded. Inside
 * `"$(cat file)"` the shell passes the file's contents as one argument without
 * expanding anything in them. `--` before it ends the CLI's options, so a
 * prompt starting with `-` can't set flags. The launcher holds only paths and
 * options, never prompt text, so a prompt can't inject commands. It runs from
 * `cwd`, so the agent loads the project's AGENTS.md / CLAUDE.md, and runs the
 * binary at an absolute path, whatever the terminal's PATH.
 */

/**
 * How a session can be started on this platform:
 * - terminal: in a new terminal window.
 * - command: by the user, running the session's `command` in a terminal.
 * - none: the launcher is a POSIX shell script, which Windows can't run.
 */
export type AgentSessionMode = "terminal" | "command" | "none";

export type AgentSessionConfig = {
  agent: LocalAgentId;
  /** Path to the agent executable. Defaults to looking it up on PATH. */
  binaryPath?: string;
  /** The project the agent works in. */
  cwd: string;
  /** The agent's own model name. Defaults to the agent's default. */
  model?: string;
  /** Defaults to "ask". */
  approval?: SessionApproval;
  /** The session's first message. */
  prompt: string;
  /** Where the prompt and launcher are written. Created if missing. */
  dir: string;
  /**
   * The files' name without extension, which neither file may have yet.
   * Defaults to `<UTC time>-<agent>-<4 hex digits>`.
   */
  name?: string;
  /** Defaults to process.platform. */
  platform?: NodeJS.Platform;
};

export type AgentSessionFiles = {
  promptPath: string;
  launcherPath: string;
  /** Runs the launcher from any POSIX terminal. */
  command: string;
};

/**
 * Why a session wasn't started. Nothing was written.
 * - unsupported_platform: the platform can't run the launcher (agentSessionMode "none").
 * - prompt_too_long: Linux caps one argument at 128 KiB, and the prompt is one.
 * - agent_not_found: no binaryPath was given, and the agent isn't on PATH.
 */
export type AgentSessionRefusal = "unsupported_platform" | "prompt_too_long" | "agent_not_found";

/** What startAgentSession() did. */
export type AgentSessionStart =
  /** A new terminal window is running the agent on the prompt. */
  | { kind: "opened"; files: AgentSessionFiles }
  /**
   * The files are written, and the user starts the session by running
   * `files.command` in a terminal. `terminalError` says why a terminal window
   * didn't open, on a platform that opens one.
   */
  | { kind: "command"; files: AgentSessionFiles; terminalError?: string }
  | { kind: "refused"; reason: AgentSessionRefusal; message: string };

// Linux caps one command-line argument at 131072 bytes (MAX_ARG_STRLEN), and
// the launcher passes the whole prompt as one. macOS only caps all arguments
// together, at 1 MiB.
const LINUX_MAX_ARGUMENT_BYTES = 131_072;

/** Pure: how a session can be started on `platform`. */
export function agentSessionMode(platform: NodeJS.Platform = process.platform): AgentSessionMode {
  if (platform === "win32") return "none";
  return platform === "darwin" ? "terminal" : "command";
}

/**
 * Writes the prompt and a launcher that starts the agent on it, and where the
 * platform can, opens a terminal window running it. Expected failures come
 * back as the result; it throws only for an unknown agent or a `name` already
 * used. Node.js only.
 */
export async function startAgentSession(config: AgentSessionConfig): Promise<AgentSessionStart> {
  if (!isLocalAgentId(config.agent)) {
    throw new TypeError(`Unknown local agent: ${String(config.agent)}`);
  }
  const platform = config.platform ?? process.platform;
  const mode = agentSessionMode(platform);
  if (mode === "none") {
    return refused("unsupported_platform", `Agent sessions need a POSIX shell, which ${platform} lacks.`);
  }
  if (platform === "linux" && Buffer.byteLength(config.prompt) >= LINUX_MAX_ARGUMENT_BYTES) {
    return refused("prompt_too_long", `The prompt is too long to pass to ${config.agent} on ${platform}.`);
  }
  const adapter = AGENT_ADAPTERS[config.agent];
  const binaryPath = config.binaryPath ?? findOnPath(adapter.binaryName);
  if (!binaryPath) {
    return refused(
      "agent_not_found",
      `${adapter.binaryName} was not found on PATH. Install ${config.agent} or set binaryPath.`,
    );
  }

  const files = writeSessionFiles(config, binaryPath, adapter.sessionArgs(config.model, config.approval ?? "ask"));
  if (mode === "command") return { kind: "command", files };
  try {
    await promisify(execFile)("open", [files.launcherPath]);
  } catch (error) {
    return { kind: "command", files, terminalError: error instanceof Error ? error.message : String(error) };
  }
  return { kind: "opened", files };
}

function refused(reason: AgentSessionRefusal, message: string): AgentSessionStart {
  return { kind: "refused", reason, message };
}

function writeSessionFiles(config: AgentSessionConfig, binaryPath: string, agentArgs: string[]): AgentSessionFiles {
  const name = config.name ?? defaultSessionName(config.agent);
  fs.mkdirSync(config.dir, { recursive: true, mode: 0o700 });
  const promptPath = path.join(config.dir, `${name}.md`);
  const launcherPath = path.join(config.dir, `${name}.command`);
  fs.writeFileSync(promptPath, config.prompt, { mode: 0o600, flag: "wx" });
  fs.writeFileSync(launcherPath, sessionLauncher({ cwd: config.cwd, binaryPath, agentArgs, promptPath }), {
    mode: 0o700,
    flag: "wx",
  });
  return { promptPath, launcherPath, command: `sh ${shellQuote(launcherPath)}` };
}

// Sorts by time, and tells apart sessions started in the same second.
function defaultSessionName(agent: LocalAgentId): string {
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  return `${stamp}-${agent}-${randomBytes(2).toString("hex")}`;
}

export type SessionLauncherTarget = {
  cwd: string;
  binaryPath: string;
  /** The agent's own options, which go before the prompt. */
  agentArgs: readonly string[];
  promptPath: string;
};

/** Pure: the shell script that starts the agent on the prompt in `promptPath`. */
export function sessionLauncher({ cwd, binaryPath, agentArgs, promptPath }: SessionLauncherTarget): string {
  const command = [binaryPath, ...agentArgs].map(shellQuote).join(" ");
  return [
    "#!/bin/sh",
    `cd ${shellQuote(cwd)} || exit 1`,
    `exec ${command} -- "$(cat ${shellQuote(promptPath)})"`,
    "",
  ].join("\n");
}

/** One single-quoted shell word, with each `'` written as `'\''`. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
