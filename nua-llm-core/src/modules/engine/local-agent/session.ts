import { execFile } from "node:child_process";
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
 *   writeAgentSession({ agent, cwd, prompt, dir, name })
 *     -> <dir>/<name>.md       the prompt, 0600
 *     -> <dir>/<name>.command  a POSIX shell launcher, 0700
 *   openInTerminal(launcherPath)
 *     -> on macOS: `open <launcher>` runs it in a new window of the user's
 *        terminal app, which needs no Automation permission
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
 * - terminal: writeAgentSession() then openInTerminal().
 * - command: writeAgentSession(); the user runs its `command` in a terminal.
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
  /** The files' name without extension. Neither file may exist yet. */
  name: string;
  /** Defaults to process.platform. */
  platform?: NodeJS.Platform;
};

export type AgentSessionFiles = {
  promptPath: string;
  launcherPath: string;
  /** Runs the launcher from any POSIX terminal. */
  command: string;
};

// Linux caps one command-line argument at 131072 bytes (MAX_ARG_STRLEN), and
// the launcher passes the whole prompt as one. macOS only caps all arguments
// together, at 1 MiB.
const LINUX_MAX_ARGUMENT_BYTES = 131_072;

/** Pure: how a session can be started on `platform`. */
export function agentSessionMode(platform: NodeJS.Platform = process.platform): AgentSessionMode {
  if (platform === "win32") return "none";
  return platform === "darwin" ? "terminal" : "command";
}

/** Pure: whether a launcher can pass `prompt` to the agent as one argument on `platform`. */
export function fitsAgentSession(prompt: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform !== "linux" || Buffer.byteLength(prompt) < LINUX_MAX_ARGUMENT_BYTES;
}

/**
 * Writes the prompt and a launcher that starts the agent on it. Throws when the
 * agent can't be found, the platform can't run the launcher, or the prompt is
 * too long for it (fitsAgentSession). Node.js only.
 */
export function writeAgentSession(config: AgentSessionConfig): AgentSessionFiles {
  if (!isLocalAgentId(config.agent)) {
    throw new TypeError(`Unknown local agent: ${String(config.agent)}`);
  }
  const platform = config.platform ?? process.platform;
  if (agentSessionMode(platform) === "none") {
    throw new Error(`Agent sessions need a POSIX shell, which ${platform} lacks.`);
  }
  if (!fitsAgentSession(config.prompt, platform)) {
    throw new RangeError(`The prompt is too long to pass to ${config.agent} on ${platform}.`);
  }
  const adapter = AGENT_ADAPTERS[config.agent];
  const binaryPath = config.binaryPath ?? findOnPath(adapter.binaryName);
  if (!binaryPath) {
    throw new Error(`${adapter.binaryName} was not found on PATH. Install ${config.agent} or set binaryPath.`);
  }

  fs.mkdirSync(config.dir, { recursive: true, mode: 0o700 });
  const promptPath = path.join(config.dir, `${config.name}.md`);
  const launcherPath = path.join(config.dir, `${config.name}.command`);
  fs.writeFileSync(promptPath, config.prompt, { mode: 0o600, flag: "wx" });
  fs.writeFileSync(
    launcherPath,
    sessionLauncher({
      cwd: config.cwd,
      binaryPath,
      agentArgs: adapter.sessionArgs(config.model, config.approval ?? "ask"),
      promptPath,
    }),
    { mode: 0o700, flag: "wx" },
  );
  return { promptPath, launcherPath, command: `sh ${shellQuote(launcherPath)}` };
}

/**
 * Runs a launcher from writeAgentSession() in a new window of the user's
 * terminal app. Only macOS can (agentSessionMode). Node.js only.
 */
export async function openInTerminal(
  launcherPath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (agentSessionMode(platform) !== "terminal") {
    throw new Error(`Opening a terminal window is not supported on ${platform}.`);
  }
  await promisify(execFile)("open", [launcherPath]);
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
