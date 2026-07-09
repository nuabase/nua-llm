import { isNuaValidationError } from "../lib/nua-errors";
import { resolveModelInput } from "../modules/model-info";
import { LlmProviderId } from "../modules/llm-client/provider-config";

const configured = (...providers: LlmProviderId[]) => new Set(providers);

describe("resolveModelInput", () => {
  it("resolves an omitted model to the fast alias", () => {
    expect(resolveModelInput(undefined, configured("cerebras"))).toEqual({
      provider: "cerebras",
      model: "zai-glm-4.7",
    });
  });

  it("resolves aliases by configured provider order", () => {
    expect(resolveModelInput({ alias: "fast" }, configured("groq"))).toEqual({
      provider: "groq",
      model: "qwen/qwen3.6-27b",
    });
  });

  it("rejects an alias when none of its providers are configured", () => {
    const result = resolveModelInput({ alias: "sonnet" }, configured("groq"));

    expect(isNuaValidationError(result)).toBe(true);
    if (isNuaValidationError(result)) {
      expect(result.message).toContain("No configured provider found");
    }
  });

  it("accepts explicit provider-native model names", () => {
    expect(
      resolveModelInput(
        { provider: "openrouter", model: " z-ai/glm-5.2 " },
        configured("openrouter"),
      ),
    ).toEqual({
      provider: "openrouter",
      model: "z-ai/glm-5.2",
    });
  });

  it("rejects unknown providers", () => {
    const result = resolveModelInput(
      { provider: "unknown", model: "z-ai/glm-5.2" } as never,
      configured("openrouter"),
    );

    expect(isNuaValidationError(result)).toBe(true);
    if (isNuaValidationError(result)) {
      expect(result.message).toContain("Invalid LLM provider");
    }
  });

  it("rejects unconfigured explicit providers", () => {
    const result = resolveModelInput(
      { provider: "openrouter", model: "z-ai/glm-5.2" },
      configured("groq"),
    );

    expect(isNuaValidationError(result)).toBe(true);
    if (isNuaValidationError(result)) {
      expect(result.message).toContain("not configured");
    }
  });

  it("rejects empty model strings", () => {
    const result = resolveModelInput(
      { provider: "openrouter", model: " " },
      configured("openrouter"),
    );

    expect(isNuaValidationError(result)).toBe(true);
    if (isNuaValidationError(result)) {
      expect(result.message).toContain("non-empty");
    }
  });

  it("rejects Gemini resource-path-shaped model names", () => {
    const result = resolveModelInput(
      { provider: "gemini", model: "models/gemini-2.5-flash" },
      configured("gemini"),
    );

    expect(isNuaValidationError(result)).toBe(true);
    if (isNuaValidationError(result)) {
      expect(result.message).toContain("bare model IDs");
    }
  });

});
