import { CanonicalModelName } from "nua-llm-core";

export type CastArrayRequestParams = {
  kind: "cast-array-request-params";
  input?: {
    prompt: string | null | undefined;
    data: unknown;
    primaryKey: string | null | undefined;
  } | null;
  output?: {
    name: string | null | undefined;
    schema: object | null | undefined;
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

export type ValidCastArrayRequestParams = {
  kind: "valid-cast-array-request-params";
  input: {
    prompt: string;
    data: object[];
    primaryKey: string;
  };
  output: {
    name: string;
    schema: object;
    effectiveSchema: object;
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
