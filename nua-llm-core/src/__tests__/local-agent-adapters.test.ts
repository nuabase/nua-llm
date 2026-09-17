import { claudeCodeAdapter } from "../modules/engine/local-agent/adapters/claude-code";
import { codexAdapter } from "../modules/engine/local-agent/adapters/codex";
import { AgentProcessResult } from "../modules/engine/local-agent/adapters/types";
import { AttemptRequest } from "../modules/engine/llm-engine";

// Outputs below are trimmed from real runs of claude 2.1.274 and codex 0.146.0.

const ENVELOPE_SCHEMA = {
  type: "object",
  properties: { value: { type: "array", items: { type: "number" } } },
  required: ["value"],
  additionalProperties: false,
};

const nativeRequest: AttemptRequest = {
  prompt: "Double each value",
  maxTokens: 100,
  enforcement: { kind: "native", schema: ENVELOPE_SCHEMA },
};

const inPromptRequest: AttemptRequest = {
  prompt: "hi",
  maxTokens: 100,
  enforcement: { kind: "in-prompt" },
};

function processResult(overrides: Partial<AgentProcessResult>): AgentProcessResult {
  return { exitCode: 0, stdout: "", stderr: "", timedOut: false, outputFiles: {}, ...overrides };
}

describe("claudeCodeAdapter", () => {
  const success = {
    type: "result",
    subtype: "success",
    is_error: false,
    api_error_status: null,
    result: '{"value":[{"id":1,"doubled":10},{"id":2,"doubled":20}]}',
    structured_output: { value: [{ id: 1, doubled: 10 }, { id: 2, doubled: 20 }] },
    total_cost_usd: 0.003524,
    usage: {
      input_tokens: 1260,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 256,
    },
    modelUsage: { "claude-haiku-4-5-20251001": { inputTokens: 2189, outputTokens: 267 } },
  };

  it("builds a tool-less invocation that keeps the subscription login", () => {
    const invocation = claudeCodeAdapter.buildInvocation(nativeRequest, "haiku");
    expect(invocation.args).toEqual(expect.arrayContaining(["-p", "--no-session-persistence"]));
    expect(invocation.args).not.toContain("--bare");
    expect(invocation.args[invocation.args.indexOf("--tools") + 1]).toBe("");
    expect(invocation.args[invocation.args.indexOf("--model") + 1]).toBe("haiku");
    expect(JSON.parse(invocation.args[invocation.args.indexOf("--json-schema") + 1])).toEqual(
      ENVELOPE_SCHEMA,
    );
    expect(invocation.stdin).toBe("Double each value");
  });

  it("omits model and schema flags for an in-prompt request with the default model", () => {
    const invocation = claudeCodeAdapter.buildInvocation(inPromptRequest, undefined);
    expect(invocation.args).not.toContain("--model");
    expect(invocation.args).not.toContain("--json-schema");
  });

  it("returns the structured envelope and reports usage", () => {
    const reply = claudeCodeAdapter.readResult(
      processResult({ stdout: JSON.stringify(success) }),
      nativeRequest,
    );
    expect(reply).toEqual({
      kind: "answered",
      answer: { kind: "structured", envelope: success.structured_output },
      usage: { promptTokens: 1260, completionTokens: 256, totalTokens: 1516 },
      model: "claude-haiku-4-5-20251001",
      costUsdEstimate: 0.003524,
    });
  });

  it("returns the raw reply as text for an in-prompt request", () => {
    const reply = claudeCodeAdapter.readResult(
      processResult({ stdout: JSON.stringify({ ...success, structured_output: undefined, result: "[1,2]" }) }),
      inPromptRequest,
    );
    expect(reply).toMatchObject({ kind: "answered", answer: { kind: "text", text: "[1,2]" } });
  });

  it("reports a schema the API refused", () => {
    const refused = {
      type: "result",
      subtype: "success",
      is_error: true,
      api_error_status: 400,
      result: "API Error: 400 tools.0.custom.input_schema.type: Input should be 'object'",
    };
    const reply = claudeCodeAdapter.readResult(
      processResult({ exitCode: 1, stdout: JSON.stringify(refused) }),
      nativeRequest,
    );
    expect(reply).toMatchObject({ kind: "failed", failure: { kind: "schema-rejected" } });
  });

  it("treats rate limits as fatal", () => {
    const limited = { is_error: true, api_error_status: 429, result: "API Error: 429 rate_limit_error" };
    const reply = claudeCodeAdapter.readResult(
      processResult({ exitCode: 1, stdout: JSON.stringify(limited) }),
      nativeRequest,
    );
    expect(reply).toMatchObject({ kind: "failed", failure: { kind: "fatal" } });
  });

  it("treats a missing structured output as transient", () => {
    const empty = { ...success, structured_output: null };
    const reply = claudeCodeAdapter.readResult(
      processResult({ stdout: JSON.stringify(empty) }),
      nativeRequest,
    );
    expect(reply).toMatchObject({
      kind: "failed",
      failure: { kind: "transient", message: expect.stringMatching(/no structured output/) },
    });
  });

  it("classifies output that is not JSON by its stderr", () => {
    const reply = claudeCodeAdapter.readResult(
      processResult({ exitCode: 1, stdout: "", stderr: "Error: Not logged in. Please run /login" }),
      nativeRequest,
    );
    expect(reply).toMatchObject({ kind: "failed", failure: { kind: "fatal" } });
  });

  it("reads login status", () => {
    const status = claudeCodeAdapter.readLoginStatus(
      processResult({ stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }) }),
    );
    expect(status).toEqual({ loggedIn: true, detail: "claude.ai" });
  });
});

describe("codexAdapter", () => {
  const successEvents = [
    { type: "thread.started", thread_id: "050505-thread" },
    { type: "turn.started" },
    {
      type: "item.completed",
      item: { id: "item_0", type: "agent_message", text: '{"value":[1,2]}' },
    },
    {
      type: "turn.completed",
      usage: { input_tokens: 13970, cached_input_tokens: 0, output_tokens: 35, reasoning_output_tokens: 0 },
    },
  ];
  const jsonl = (events: object[]) => events.map((e) => JSON.stringify(e)).join("\n");

  it("writes the schema to a file and reads the last message back", () => {
    const invocation = codexAdapter.buildInvocation(nativeRequest, undefined);
    expect(invocation.args.slice(0, 2)).toEqual(["exec", "-"]);
    expect(invocation.args).toEqual(expect.arrayContaining(["--ephemeral", "--ignore-user-config", "read-only"]));
    expect(invocation.args).not.toContain("-m");
    const schemaFile = invocation.args[invocation.args.indexOf("--output-schema") + 1];
    expect(invocation.files).toEqual([{ name: schemaFile, content: JSON.stringify(ENVELOPE_SCHEMA) }]);
    expect(invocation.outputFiles).toEqual([invocation.args[invocation.args.indexOf("-o") + 1]]);
  });

  it("only accepts schemas it can express in strict mode", () => {
    expect(codexAdapter.nativeSchema(ENVELOPE_SCHEMA)).toEqual(ENVELOPE_SCHEMA);
    const optionalField = {
      type: "object",
      properties: { value: { type: "object", properties: { a: { type: "string" } } } },
      required: ["value"],
    };
    expect(codexAdapter.nativeSchema(optionalField)).toBeNull();
  });

  it("parses the reply into the envelope and sums usage", () => {
    const reply = codexAdapter.readResult(
      processResult({ stdout: jsonl(successEvents), outputFiles: { "last-message.txt": '{"value":[1,2]}' } }),
      nativeRequest,
    );
    expect(reply).toEqual({
      kind: "answered",
      answer: { kind: "structured", envelope: { value: [1, 2] } },
      usage: { promptTokens: 13970, completionTokens: 35, totalTokens: 14005 },
      model: undefined,
      costUsdEstimate: undefined,
    });
  });

  it("falls back to the agent_message event when the output file is missing", () => {
    const reply = codexAdapter.readResult(processResult({ stdout: jsonl(successEvents) }), nativeRequest);
    expect(reply).toMatchObject({ answer: { kind: "structured", envelope: { value: [1, 2] } } });
  });

  it("treats a native reply that is not JSON as transient", () => {
    const reply = codexAdapter.readResult(
      processResult({ stdout: jsonl(successEvents), outputFiles: { "last-message.txt": "sure! [1,2]" } }),
      nativeRequest,
    );
    expect(reply).toMatchObject({ kind: "failed", failure: { kind: "transient" } });
  });

  it("reports a schema the API refused", () => {
    const message =
      '{"type":"error","error":{"type":"invalid_request_error","code":"invalid_json_schema","message":"Invalid schema for response_format \'codex_output_schema\': In context=(), \'additionalProperties\' is required to be supplied and to be false."},"status":400}';
    const events = [{ type: "turn.started" }, { type: "error", message }, { type: "turn.failed", error: { message } }];
    const reply = codexAdapter.readResult(processResult({ exitCode: 1, stdout: jsonl(events) }), nativeRequest);
    expect(reply).toMatchObject({ kind: "failed", failure: { kind: "schema-rejected" } });
  });

  it("treats a model the ChatGPT plan does not offer as fatal", () => {
    const message =
      '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-sample-050505\' model is not supported when using Codex with a ChatGPT account."}}';
    const events = [{ type: "turn.failed", error: { message } }];
    const reply = codexAdapter.readResult(processResult({ exitCode: 1, stdout: jsonl(events) }), nativeRequest);
    expect(reply).toMatchObject({ kind: "failed", failure: { kind: "fatal" } });
  });

  it("ignores item-level warnings", () => {
    const events = [
      { type: "item.completed", item: { id: "item_w", type: "error", message: "Model metadata not found." } },
      ...successEvents,
    ];
    const reply = codexAdapter.readResult(processResult({ stdout: jsonl(events) }), inPromptRequest);
    expect(reply).toMatchObject({ kind: "answered", answer: { kind: "text", text: '{"value":[1,2]}' } });
  });

  it("reads login status from the exit code", () => {
    expect(codexAdapter.readLoginStatus(processResult({ stdout: "Logged in using ChatGPT" })).loggedIn).toBe(true);
    expect(codexAdapter.readLoginStatus(processResult({ exitCode: 1, stdout: "Not logged in" })).loggedIn).toBe(false);
  });
});
