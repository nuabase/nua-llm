import { CanonicalModelName } from "nua-llm-core";

export type CastValueRequestParams = {
  kind: "cast-value-request-params";
  output?: {
    name: string | null | undefined;
    schema: object | null | undefined;
  } | null;
  input?: {
    prompt: string | null | undefined;
    data: unknown;
  } | null;
  notify?: {
    metadata: object | null | undefined;
    webhookUrl: string | null | undefined;
  } | null;
  options?: {
    invalidateCache?: boolean | null | undefined;
  } | null;
  model?: string | null;
};

export type ValidCastValueRequestParams = {
  kind: "valid-cast-value-request-params";
  output: {
    name: string;
    schema: object;
    effectiveSchema: object;
  };
  input: {
    prompt: string;
    data: unknown;
  };
  notify:
  | {
    metadata: object | undefined;
    webhookUrl: string | undefined;
  }
  | undefined;
  options: {
    invalidateCache: boolean;
  };
  model: CanonicalModelName;
};
