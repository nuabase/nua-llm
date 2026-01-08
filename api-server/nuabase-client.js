"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NuabaseZodClient = exports.NuabaseAPIError = void 0;
const zod_1 = require("zod");
class NuabaseAPIError extends Error {
    constructor(error, message, status) {
        super(message);
        this.name = "NuabaseAPIError";
        this.error = error;
        this.status = status;
    }
}
exports.NuabaseAPIError = NuabaseAPIError;
class NuabaseZodClient {
    constructor(client) {
        this.client = client;
    }
    async queryNow(params) {
        const jsonSchema = zod_1.z.toJSONSchema(params.schema);
        const result = await this.client.request({
            data: params.data,
            prompt: params.prompt,
            schema: jsonSchema,
        });
        return result;
    }
}
exports.NuabaseZodClient = NuabaseZodClient;
class Nuabase {
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.NUABASE_API_KEY || "";
        this.baseUrl = config.baseUrl || "http://localhost:3030";
        if (!this.apiKey) {
            throw new Error("API key is required. Provide it via config.apiKey or NUABASE_API_KEY environment variable.");
        }
        this.zod = new NuabaseZodClient(this);
    }
    async request(params) {
        const url = `${this.baseUrl}/query_now`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(params),
        });
        const data = await response.json();
        if (!response.ok) {
            const errorData = data;
            throw new NuabaseAPIError(errorData.error, errorData.message, response.status);
        }
        const result = data;
        return result.result;
    }
}
exports.default = Nuabase;
