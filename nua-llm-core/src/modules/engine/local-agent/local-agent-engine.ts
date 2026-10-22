import { generateSpanId, logLlmCallError, Logger } from "../../../lib/logger";
import { JsonSchema } from "../../../lib/schema-utils";
import { AttemptFailure, AttemptOutcome, AttemptRequest, LlmEngine } from "../llm-engine";
import { AgentAdapter, AgentCallOptions, AgentProcessResult } from "./adapters/types";
import { runInvocation } from "./process-runner";
import { Semaphore } from "./semaphore";

/** How to run one installed agent's processes. Set up once and shared by all its engines. */
export type AgentRunner = {
  adapter: AgentAdapter;
  binaryPath: string;
  /** Env vars removed from the agent's environment. */
  unsetEnv: string[];
  /** Bounds how many agent processes run at once, across all models. */
  limiter: Semaphore;
  logger: Logger;
};

/** How one engine's attempts run: the CLI's options and how long each may take. */
export type AgentCall = AgentCallOptions & {
  /** Per-attempt limit. */
  timeoutMs: number;
};

/**
 * Answers prompts on one model of a coding-agent CLI installed on this machine.
 * Each attempt is one agent process. maxTokens has no CLI equivalent and is ignored.
 */
export class LocalAgentEngine implements LlmEngine {
  constructor(
    private readonly runner: AgentRunner,
    private readonly call: AgentCall,
  ) {}

  nativeSchema(envelopeSchema: JsonSchema): JsonSchema | null {
    return this.runner.adapter.nativeSchema(envelopeSchema);
  }

  attempt(request: AttemptRequest): Promise<AttemptOutcome> {
    return this.runner.limiter.run(() => this.runAgent(request));
  }

  private async runAgent(request: AttemptRequest): Promise<AttemptOutcome> {
    const { adapter, binaryPath, logger, unsetEnv } = this.runner;
    const { model, effort, timeoutMs } = this.call;
    const spanId = generateSpanId();
    const startTime = Date.now();
    const method = request.enforcement.kind;

    // Same log shape as the HTTP engine, minus the HTTP-only fields.
    logger.info("LLM call started", {
      type: "llm_call_start",
      span_id: spanId,
      service: adapter.id,
      method,
      binaryPath,
      model: model ?? "default",
    });

    const failed = (failure: AttemptFailure): AttemptOutcome => {
      logLlmCallError(logger, spanId, adapter.id, method, failure.message, Date.now() - startTime);
      return { kind: "failed", failure };
    };

    let result: AgentProcessResult;
    try {
      result = await runInvocation({
        binaryPath,
        invocation: adapter.buildInvocation(request, { model, effort }),
        timeoutMs,
        unsetEnv,
      });
    } catch (error) {
      return failed({ kind: "fatal", message: error instanceof Error ? error.message : String(error) });
    }

    if (result.timedOut) {
      return failed({ kind: "fatal", message: `did not finish within ${timeoutMs}ms` });
    }

    const reply = adapter.readResult(result, request);
    if (reply.kind === "failed") {
      return failed(reply.failure);
    }

    logger.info("LLM call completed", {
      type: "llm_call_complete",
      span_id: spanId,
      service: adapter.id,
      method,
      exitCode: result.exitCode,
      usage: reply.usage,
      duration_ms: Date.now() - startTime,
    });

    return {
      kind: "answered",
      answer: reply.answer,
      usage: reply.usage,
      origin: {
        engine: "local-agent",
        agent: adapter.id,
        model: reply.model ?? model,
        costUsdEstimate: reply.costUsdEstimate,
      },
    };
  }
}
