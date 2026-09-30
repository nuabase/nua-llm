import { buildGeminiAgenticRequest, parseGeminiAgenticResponse } from "../modules/agent/provider-formatters";

describe("Gemini thought signatures", () => {
  it("sends a function call's thought signature back with it", async () => {
    const reply = new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "lookup", args: { q: "x" } }, thoughtSignature: "sig-1" }],
            },
          },
        ],
      }),
      { status: 200 },
    );
    const parsed = await parseGeminiAgenticResponse(reply);

    const request = buildGeminiAgenticRequest(
      { messages: [{ role: "user", content: "hi" }, parsed.message], tools: [], model: "gemini-3.8-flash", maxTokens: 100 },
      "key",
    );

    expect((request.body as { contents: unknown[] }).contents[1]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "lookup", args: { q: "x" } }, thoughtSignature: "sig-1" }],
    });
  });
});
