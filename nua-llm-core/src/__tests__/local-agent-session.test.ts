import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { claudeCodeAdapter } from "../modules/engine/local-agent/adapters/claude-code";
import { codexAdapter } from "../modules/engine/local-agent/adapters/codex";
import { piAdapter } from "../modules/engine/local-agent/adapters/pi";
import {
  agentSessionMode,
  fitsAgentSession,
  openInTerminal,
  sessionLauncher,
  writeAgentSession,
} from "../modules/engine/local-agent/session";

const run = promisify(execFile);

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

describe("fitsAgentSession", () => {
  it("refuses a prompt too long for one argument on Linux only", () => {
    const long = "x".repeat(131_072);
    expect(fitsAgentSession(long, "linux")).toBe(false);
    expect(fitsAgentSession(long.slice(1), "linux")).toBe(true);
    expect(fitsAgentSession(long, "darwin")).toBe(true);
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

describe("writeAgentSession", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nua-session-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes the prompt and a launcher only their owner can read", () => {
    const sessionDir = path.join(dir, "sessions");
    const files = writeAgentSession({
      agent: "claude-code",
      binaryPath: "/sample/bin/claude",
      cwd: dir,
      model: "opus",
      approval: "auto",
      prompt: PROMPT,
      dir: sessionDir,
      name: "sample",
      platform: "darwin",
    });

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

  it("never overwrites a session's files", () => {
    const config = { agent: "pi" as const, binaryPath: "/sample/bin/pi", cwd: dir, prompt: "hi", dir, name: "sample" };
    writeAgentSession({ ...config, platform: "darwin" });
    expect(() => writeAgentSession({ ...config, platform: "darwin" })).toThrow(/EEXIST/);
  });

  it("refuses on Windows and a prompt too long for Linux, writing nothing", () => {
    const config = { agent: "codex" as const, binaryPath: "/sample/bin/codex", cwd: dir, dir, name: "sample" };
    expect(() => writeAgentSession({ ...config, prompt: "hi", platform: "win32" })).toThrow(/POSIX shell/);
    expect(() => writeAgentSession({ ...config, prompt: "x".repeat(131_072), platform: "linux" })).toThrow(RangeError);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe("openInTerminal", () => {
  it("refuses where no terminal window can be opened", async () => {
    await expect(openInTerminal("/sample/sample.command", "linux")).rejects.toThrow(/not supported on linux/);
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
    const files = writeAgentSession({
      agent: "codex",
      binaryPath,
      cwd,
      model: "gpt-5.6-sol",
      approval: "auto",
      prompt: PROMPT,
      dir: path.join(cwd, "sessions"),
      name: "sample",
    });

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
