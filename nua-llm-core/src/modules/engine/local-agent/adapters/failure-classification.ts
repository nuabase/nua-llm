import { AttemptFailure } from "../../llm-engine";
import { AgentProcessResult } from "./types";

// Failures that will repeat on every attempt: missing login, exhausted plan
// limits, or a model the plan does not offer. The CLIs report these only as
// free text, so they are recognised by message.
const FATAL_PATTERNS = [
  /not logged in/i,
  /logged out/i,
  /(please|need to|must) (run .*)?log ?in/i,
  /authenticat/i,
  /unauthori[sz]ed/i,
  /invalid api key/i,
  /oauth/i,
  /usage limit/i,
  /rate.?limit/i,
  /quota/i,
  /credit balance/i,
  /\b40[13]\b/,
  /\b429\b/,
  /not supported when using/i,
  /model .* (does not exist|not found|not available)/i,
];

export function classifyAgentFailure(agent: string, message: string): AttemptFailure {
  const full = `${agent}: ${message}`;
  if (FATAL_PATTERNS.some((pattern) => pattern.test(message))) {
    return { kind: "fatal", message: full };
  }
  return { kind: "transient", message: full };
}

export function stderrTail(result: AgentProcessResult, maxChars = 2000): string {
  const stderr = result.stderr.trim();
  return stderr.length > maxChars ? stderr.slice(-maxChars) : stderr;
}
