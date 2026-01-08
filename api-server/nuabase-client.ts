import { z } from "zod";

export interface NuabaseConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface NuabaseError {
  error: string;
  message: string;
}

export interface TransformRequest<T = any> {
  data?: T;
  prompt?: string;
  schema?: object;
}

export interface TransformResponse<T = any> {
  result: T;
}

export class NuabaseAPIError extends Error {
  public readonly error: string;
  public readonly status?: number;

  constructor(error: string, message: string, status?: number) {
    super(message);
    this.name = "NuabaseAPIError";
    this.error = error;
    this.status = status;
  }
}

export class NuabaseZodClient {
  constructor(private client: Nuabase) {}

  async queryNow<T extends z.ZodType>(params: {
    data?: any;
    prompt?: string;
    schema: T;
  }): Promise<z.infer<T>> {
    const jsonSchema = z.toJSONSchema(params.schema);

    const result = await this.client.request<z.infer<T>>({
      data: params.data,
      prompt: params.prompt,
      schema: jsonSchema,
    });

    return result;
  }
}

export default class Nuabase {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  public readonly zod: NuabaseZodClient;

  constructor(config: NuabaseConfig = {}) {
    this.apiKey = config.apiKey || process.env.NUABASE_API_KEY || "";
    this.baseUrl = config.baseUrl || "http://localhost:3030";

    if (!this.apiKey) {
      throw new Error(
        "API key is required. Provide it via config.apiKey or NUABASE_API_KEY environment variable.",
      );
    }

    this.zod = new NuabaseZodClient(this);
  }

  async request<T = any>(params: TransformRequest): Promise<T> {
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
      const errorData = data as NuabaseError;
      throw new NuabaseAPIError(
        errorData.error,
        errorData.message,
        response.status,
      );
    }

    const result = data as TransformResponse<T>;
    return result.result;
  }
}
