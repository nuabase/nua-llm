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
    });
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
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
    });
    expect(result.timedOut).toBe(true);
  });

  it("rejects when the binary does not exist", async () => {
    await expect(
      runInvocation({
        binaryPath: "/nonexistent/sample-agent-050505",
        invocation: { args: [], stdin: "" },
        timeoutMs: 1000,
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
