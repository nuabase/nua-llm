import { ConsoleLogger } from "../../lib/logger";
import { listSchema } from "../../modules/cast/list-schema";
import { isLocalAgentId, LocalAgentId } from "../../modules/engine/local-agent/agent-id";
import { localAgent } from "../../modules/engine/local-agent/create-local-agent";
import { detectLocalAgents } from "../../modules/engine/local-agent/detect";
import { NuaLlmClient } from "../../nua-llm-client";

// Runs the real coding-agent CLIs on this machine, using their own logins.
// Opt in with e.g. NUA_LOCAL_AGENTS=claude-code,codex
const agents = (process.env.NUA_LOCAL_AGENTS ?? "")
  .split(",")
  .map((a) => a.trim())
  .filter(isLocalAgentId);

const describeIfAgents = agents.length > 0 ? describe : describe.skip;

describeIfAgents("detectLocalAgents", () => {
  it("reports requested agents as installed and logged in", async () => {
    const statuses = await detectLocalAgents();
    for (const agent of agents) {
      const status = statuses.find((s) => s.agent === agent);
      expect(status).toMatchObject({ installed: true, loggedIn: true });
    }
  }, 60_000);
});

// Whether each agent can enforce the fallback test's schema (an optional property) natively.
const ENFORCES_OPTIONAL_PROPERTIES: Record<LocalAgentId, boolean> = {
  "claude-code": true,
  codex: false,
};

describe.each(agents.length > 0 ? agents : ["none" as const])("local agent %s", (agent) => {
  if (agent === "none") {
    it.skip("set NUA_LOCAL_AGENTS to run", () => undefined);
    return;
  }

  const client = new NuaLlmClient(localAgent({ agent, logger: new ConsoleLogger() }));

  it("casts a list with native schema enforcement", async () => {
    const result = await client.castArray<{ id: string; account: string }>({
      input: {
        prompt: "Pick the ledger account for each bank transaction.",
        data: [
          { id: "txn-1", text: "NOPII RESTAURANT sample" },
          { id: "txn-2", text: "NOPII AIRLINE TICKET sample" },
        ],
      },
      output: listSchema(
        { type: "string", enum: ["Expenses:Food", "Expenses:Travel", "Income:Salary"] },
        { primaryKey: "id", outputName: "account" },
      ),
    });

    if (!result.success) throw new Error(result.error);
    const byId = Object.fromEntries(result.data.map((row) => [row.id, row.account]));
    expect(byId).toEqual({ "txn-1": "Expenses:Food", "txn-2": "Expenses:Travel" });
    expect(result.schemaEnforcement).toBe("native");
    expect(result.origin).toMatchObject({ engine: "local-agent", agent });
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  }, 300_000);

  it("casts a single scalar value", async () => {
    const result = await client.castValue<number>({
      input: { prompt: "How many days are in a week?" },
      output: { name: "days", schema: { type: "number" } },
    });
    if (!result.success) throw new Error(result.error);
    expect(result.data).toBe(7);
  }, 300_000);

  it("falls back to the schema in the prompt when the agent cannot enforce it", async () => {
    const result = await client.castValue<{ city: string }>({
      input: { prompt: "Which city is the capital of France? Omit nickname." },
      output: {
        name: "capital",
        schema: {
          type: "object",
          properties: { city: { type: "string" }, nickname: { type: "string" } },
          required: ["city"],
        },
      },
    });
    if (!result.success) throw new Error(result.error);
    expect(result.data.city).toBe("Paris");
    expect(result.schemaEnforcement).toBe(ENFORCES_OPTIONAL_PROPERTIES[agent] ? "native" : "in-prompt");
  }, 300_000);
});
