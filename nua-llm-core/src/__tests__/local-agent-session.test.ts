import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { claudeCodeAdapter } from "../modules/engine/local-agent/adapters/claude-code";
import { codexAdapter } from "../modules/engine/local-agent/adapters/codex";
import { piAdapter } from "../modules/engine/local-agent/adapters/pi";
import {
  agentSessionMode,
  AgentSessionConfig,
  AgentSessionFiles,
  AgentSessionStart,
  sessionLauncher,
  startAgentSession,
} from "../modules/engine/local-agent/session";

// macOS's `open` would open a real terminal window, so execFile is a mock;
// it runs the real one unless a test says otherwise.
jest.mock("node:child_process", () => {
  const actual = jest.requireActual<typeof childProcess>("node:child_process");
  return { ...actual, execFile: jest.fn(actual.execFile) };
});
const execFileMock = jest.mocked(childProcess.execFile);
const run = promisify(jest.requireActual<typeof childProcess>("node:child_process").execFile);

const PROMPT = [
  "--settings={} Read `sample notes.md` first.",
  'Then run: curl -H "Authorization: Bearer $SAMPLE_TOKEN" "$SAMPLE_URL/api/items"',
  "A path with backslashes: C:\\sample\\dir and $(echo not-run) and 'quotes'.",
].join("\n");

describe("sessionArgs", () => {
  it("names the model and puts each agent in its auto mode", () => {
    expect(claudeCodeAdapter.sessionArgs("opus", "auto")).toEqual(["--model", "opus", "--permission-mode", "auto"]);
    expect(codexAdapter.sessionArgs("gpt-5.6-sol", "auto")).toEqual(["--model", "gpt-5.6-sol", "--approve-for-me"]);
    expect(piAdapter.sessionArgs(undefined, "auto")).toEqual(["--approve"]);
  });

  it("adds nothing when the CLI's defaults apply", () => {
    for (const adapter of [claudeCodeAdapter, codexAdapter, piAdapter]) {
      expect(adapter.sessionArgs(undefined, "ask")).toEqual([]);
    }
  });
});

describe("agentSessionMode", () => {
  it("opens a terminal on macOS, gives a command on other POSIX systems, and nothing on Windows", () => {
    expect(agentSessionMode("darwin")).toBe("terminal");
    expect(agentSessionMode("linux")).toBe("command");
    expect(agentSessionMode("win32")).toBe("none");
  });
});

describe("sessionLauncher", () => {
  it("cds to the project and runs the binary with its options on the prompt file", () => {
    expect(
      sessionLauncher({
        cwd: "/sample/project",
        binaryPath: "/sample/bin/claude",
        agentArgs: ["--model", "opus", "--permission-mode", "auto"],
        promptPath: "/sample/project/tmp/sample.md",
      }),
    ).toBe(
      [
        "#!/bin/sh",
        "cd '/sample/project' || exit 1",
        `exec '/sample/bin/claude' '--model' 'opus' '--permission-mode' 'auto' -- "$(cat '/sample/project/tmp/sample.md')"`,
        "",
      ].join("\n"),
    );
  });

  it("quotes paths with spaces and single quotes", () => {
    const script = sessionLauncher({
      cwd: "/sample/NOPII's project",
      binaryPath: "/sample/my bin/codex",
      agentArgs: ["--approve-for-me"],
      promptPath: "/sample/NOPII's project/sample.md",
    });

    expect(script).toContain(`cd '/sample/NOPII'\\''s project' || exit 1`);
    expect(script).toContain(
      `exec '/sample/my bin/codex' '--approve-for-me' -- "$(cat '/sample/NOPII'\\''s project/sample.md')"`,
    );
  });
});

/** The files of a session that was started, or a failed test. */
function filesOf(started: AgentSessionStart): AgentSessionFiles {
  if (started.kind === "refused") throw new Error(`refused: ${started.message}`);
  return started.files;
}

describe("startAgentSession", () => {
  let dir: string;
  let config: AgentSessionConfig;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nua-session-"));
    config = { agent: "claude-code", binaryPath: "/sample/bin/claude", cwd: dir, prompt: PROMPT, dir, name: "sample" };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Stands in for the next `open`, which succeeds or fails with `error`. */
  function stubOpen(error: Error | null = null) {
    execFileMock.mockClear();
    execFileMock.mockImplementationOnce(((_file: string, _args: string[], callback: (error: Error | null) => void) => {
      callback(error);
    }) as unknown as typeof childProcess.execFile);
    return execFileMock;
  }

  it("writes the prompt and a launcher only their owner can read, for the user to run on Linux", async () => {
    const sessionDir = path.join(dir, "sessions");
    const started = await startAgentSession({
      ...config,
      model: "opus",
      approval: "auto",
      dir: sessionDir,
      platform: "linux",
    });

    expect(started.kind).toBe("command");
    const files = filesOf(started);
    expect(files.promptPath).toBe(path.join(sessionDir, "sample.md"));
    expect(files.launcherPath).toBe(path.join(sessionDir, "sample.command"));
    expect(files.command).toBe(`sh '${files.launcherPath}'`);
    expect(fs.readFileSync(files.promptPath, "utf8")).toBe(PROMPT);
    expect(fs.statSync(files.promptPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(files.launcherPath).mode & 0o777).toBe(0o700);
    expect(fs.readFileSync(files.launcherPath, "utf8")).toContain(
      `exec '/sample/bin/claude' '--model' 'opus' '--permission-mode' 'auto' -- `,
    );
  });

  it("opens the launcher in a terminal window on macOS", async () => {
    const open = stubOpen();

    const started = await startAgentSession({ ...config, platform: "darwin" });

    expect(started.kind).toBe("opened");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0].slice(0, 2)).toEqual(["open", [filesOf(started).launcherPath]]);
  });

  it("says why the terminal window didn't open, with the files written", async () => {
    stubOpen(new Error("sample failure"));

    const started = await startAgentSession({ ...config, platform: "darwin" });

    expect(started).toMatchObject({ kind: "open_failed", error: "sample failure" });
    expect(fs.existsSync(filesOf(started).launcherPath)).toBe(true);
  });

  it("names the files by time and agent when given no name", async () => {
    const started = await startAgentSession({ ...config, name: undefined, platform: "linux" });

    expect(path.basename(filesOf(started).promptPath)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-claude-code-[0-9a-f]{4}\.md$/,
    );
  });

  it("never overwrites a session's files", async () => {
    await startAgentSession({ ...config, platform: "linux" });
    await expect(startAgentSession({ ...config, platform: "linux" })).rejects.toThrow(/EEXIST/);
  });

  it("refuses on Windows, a prompt too long for Linux and an agent not on PATH, writing nothing", async () => {
    await expect(startAgentSession({ ...config, platform: "win32" })).resolves.toMatchObject({
      kind: "refused",
      reason: "unsupported_platform",
    });
    await expect(
      startAgentSession({ ...config, prompt: "x".repeat(131_072), platform: "linux" }),
    ).resolves.toMatchObject({ kind: "refused", reason: "prompt_too_long" });
    const pathBefore = process.env.PATH;
    process.env.PATH = "";
    try {
      await expect(startAgentSession({ ...config, binaryPath: undefined, platform: "linux" })).resolves.toMatchObject({
        kind: "refused",
        reason: "agent_not_found",
      });
    } finally {
      process.env.PATH = pathBefore;
    }
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("passes a prompt just under Linux's limit", async () => {
    const started = await startAgentSession({ ...config, prompt: "x".repeat(131_071), platform: "linux" });
    expect(started.kind).toBe("command");
  });
});

(process.platform === "win32" ? describe.skip : describe)("running a launcher", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nua-session-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("runs the binary in the project with its options, then the prompt unchanged after they end", async () => {
    const cwd = path.join(dir, "NOPII's project");
    const binaryPath = path.join(dir, "my bin", "agent");
    fs.mkdirSync(cwd);
    fs.mkdirSync(path.dirname(binaryPath));
    // A stand-in agent that reports where it ran and what it was given, one
    // argument a line.
    fs.writeFileSync(binaryPath, '#!/bin/sh\nprintf "%s\\n%s" "$#" "$(pwd -P)"\nprintf "\\n%s" "$@"\n', {
      mode: 0o700,
    });
    const files = filesOf(
      await startAgentSession({
        agent: "codex",
        binaryPath,
        cwd,
        model: "gpt-5.6-sol",
        approval: "auto",
        prompt: PROMPT,
        dir: path.join(cwd, "sessions"),
        platform: "linux",
      }),
    );

    const { stdout } = await run("/bin/sh", ["-c", files.command], {
      env: { PATH: "/usr/bin:/bin", SAMPLE_TOKEN: "expanded", SAMPLE_URL: "expanded" },
    });

    const [argumentCount, workingDir, ...lines] = stdout.split("\n");
    expect(argumentCount).toBe("5");
    expect(lines.slice(0, 4)).toEqual(["--model", "gpt-5.6-sol", "--approve-for-me", "--"]);
    expect(workingDir).toBe(fs.realpathSync(cwd));
    expect(lines.slice(4).join("\n")).toBe(PROMPT);
  });
});
