import { findOnPath, runInvocation } from "../modules/engine/local-agent/process-runner";

// Uses the running Node binary as a stand-in agent process.
const node = process.execPath;

describe("runInvocation", () => {
  it("feeds stdin, provides input files, and reads output files", async () => {
    const script = `
      const fs = require("fs");
      let input = "";
      process.stdin.on("data", (c) => (input += c));
      process.stdin.on("end", () => {
        const schema = fs.readFileSync("schema.json", "utf8");
        fs.writeFileSync("out.txt", input.toUpperCase() + "|" + schema);
        console.log("cwd-empty-before-run:" + !fs.existsSync("package.json"));
      });
    `;
    const result = await runInvocation({
      binaryPath: node,
      invocation: {
        args: ["-e", script],
        stdin: "sample prompt",
        files: [{ name: "schema.json", content: '{"type":"object"}' }],
        outputFiles: ["out.txt", "never-written.txt"],
      },
      timeoutMs: 10_000,
      idleTimeoutMs: null,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stopped).toBeNull();
    expect(result.stdout.trim()).toBe("cwd-empty-before-run:true");
    expect(result.outputFiles["out.txt"]).toBe('SAMPLE PROMPT|{"type":"object"}');
    expect(result.outputFiles["never-written.txt"]).toBeUndefined();
  });

  it("removes the listed env vars from the child", async () => {
    process.env.NUA_TEST_SECRET_050505 = "sample";
    try {
      const result = await runInvocation({
        binaryPath: node,
        invocation: { args: ["-e", "console.log(String(process.env.NUA_TEST_SECRET_050505))"], stdin: "" },
        timeoutMs: 10_000,
        idleTimeoutMs: null,
        unsetEnv: ["NUA_TEST_SECRET_050505"],
      });
      expect(result.stdout.trim()).toBe("undefined");
    } finally {
      delete process.env.NUA_TEST_SECRET_050505;
    }
  });

  it("interrupts a process that runs past the timeout", async () => {
    const result = await runInvocation({
      binaryPath: node,
      invocation: { args: ["-e", "setTimeout(() => {}, 60000)"], stdin: "" },
      timeoutMs: 200,
      idleTimeoutMs: null,
    });
    expect(result.stopped).toEqual({ by: "total", limitMs: 200, afterMs: expect.any(Number), lastOutputAtMs: null });
    expect(result.stopped!.afterMs).toBeGreaterThanOrEqual(200);
  });

  it("stops a process that prints nothing for the idle limit, but not one that keeps printing", async () => {
    const quiet = await runInvocation({
      binaryPath: node,
      invocation: { args: ["-e", "console.log('started'); setTimeout(() => {}, 60000)"], stdin: "" },
      timeoutMs: 10_000,
      idleTimeoutMs: 200,
    });
    expect(quiet.stopped).toMatchObject({ by: "idle", limitMs: 200 });
    // It printed once, at the start, and was stopped the idle limit after that.
    const { afterMs, lastOutputAtMs } = quiet.stopped!;
    expect(afterMs - lastOutputAtMs!).toBeGreaterThanOrEqual(200);

    // Prints every 100 ms for 600 ms: longer than the idle limit in all, never quiet for it.
    const chatty = await runInvocation({
      binaryPath: node,
      invocation: {
        args: ["-e", "let n = 0; const t = setInterval(() => { console.log(n); if (++n === 6) clearInterval(t); }, 100)"],
        stdin: "",
      },
      timeoutMs: 10_000,
      idleTimeoutMs: 300,
    });
    expect(chatty.stopped).toBeNull();
    expect(chatty.stdout.trim().split("\n")).toEqual(["0", "1", "2", "3", "4", "5"]);
  });

  it("passes output to the listener as it arrives, and still returns all of it", async () => {
    const seen: { chunk: string; stream: string; at: number }[] = [];
    const started = Date.now();
    const result = await runInvocation({
      binaryPath: node,
      invocation: {
        args: ["-e", "console.log('first'); console.error('warn'); setTimeout(() => console.log('später ✓'), 300)"],
        stdin: "",
      },
      timeoutMs: 10_000,
      idleTimeoutMs: null,
      onOutput: (chunk, stream) => seen.push({ chunk, stream, at: Date.now() - started }),
    });
    const text = (stream: string) => seen.filter((s) => s.stream === stream).map((s) => s.chunk).join("");
    expect(text("stdout")).toBe(result.stdout);
    expect(text("stderr")).toBe(result.stderr);
    expect(result.stdout).toBe("first\nspäter ✓\n");
    expect(result.stderr).toBe("warn\n");
    // The first line arrived before the process ended, not with the result.
    const first = seen.find((s) => s.chunk.includes("first"))!;
    const last = seen.find((s) => s.chunk.includes("später"))!;
    expect(last.at - first.at).toBeGreaterThanOrEqual(200);
  });

  it("stops the process when the signal aborts, and returns once it has exited", async () => {
    const controller = new AbortController();
    let pid: number | undefined;
    const result = await runInvocation({
      binaryPath: node,
      // Ignores SIGINT, so only the SIGKILL after the grace period ends it.
      invocation: { args: ["-e", "process.on('SIGINT', () => {}); console.log(process.pid); setInterval(() => {}, 1000)"], stdin: "" },
      timeoutMs: 10_000,
      idleTimeoutMs: null,
      signal: controller.signal,
      onOutput: (chunk) => {
        pid ??= Number(chunk.trim());
        controller.abort();
      },
    });
    expect(result.stopped).toMatchObject({ by: "signal" });
    expect(result.exitCode).toBeNull();
    expect(() => process.kill(pid!, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  });

  it("stops the process at once when the signal has already aborted", async () => {
    const result = await runInvocation({
      binaryPath: node,
      invocation: { args: ["-e", "setTimeout(() => console.log('ran'), 500)"], stdin: "" },
      timeoutMs: 10_000,
      idleTimeoutMs: null,
      signal: AbortSignal.abort(),
    });
    expect(result.stopped).toMatchObject({ by: "signal", lastOutputAtMs: null });
    expect(result.stdout).toBe("");
  });

  it("rejects when the binary does not exist", async () => {
    await expect(
      runInvocation({
        binaryPath: "/nonexistent/sample-agent-050505",
        invocation: { args: [], stdin: "" },
        timeoutMs: 1000,
        idleTimeoutMs: null,
      }),
    ).rejects.toThrow(/Could not start .*: not found/);
  });
});

describe("findOnPath", () => {
  it("finds node and not a made-up binary", () => {
    expect(findOnPath("node")).toBeTruthy();
    expect(findOnPath("sample-agent-050505")).toBeNull();
  });
});
