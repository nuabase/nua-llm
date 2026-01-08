import { NuaLlmClient, ConsoleLogger } from "../src/nua-llm-core";

async function main() {
    console.log("Initializing NuaLlmClient...");
    const client = new NuaLlmClient({
        logger: new ConsoleLogger(),
        providers: {
            cerebras: { apiKey: process.env.CEREBRAS_API_KEY || "dummy" },
            groq: { apiKey: process.env.GROQ_API_KEY || "dummy" }
        }
    });

    console.log("Client initialized successfully.");

    // Construct a sample Cast Value request
    const params = {
        model: "fast",
        input: {
            prompt: "Extract name",
            data: "My name is Alice"
        },
        output: {
            name: "Person",
            effectiveSchema: {
                type: "object",
                properties: {
                    name: { type: "string" }
                },
                required: ["name"]
            }
        }
    };

    console.log("Mocking castValue call (not actually calling to save tokens/avoid failures if no key)...");
    // We won't actually await this unless we want to test network.
    // await client.castValue(params);

    console.log("Verification checks passed: Modules imported, Client class instantiated.");
}

main().catch(console.error);
