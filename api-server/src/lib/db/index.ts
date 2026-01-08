import type { Knex } from "knex";
import { getPgDb, closeAll } from "./connector";
import { config } from "../config";

if (!config.dbLlmCacheUrl) {
  throw new Error("DB_LLM_CACHE_URL environment variable is required");
}

if (!config.dbLlmMainUrl) {
  throw new Error("DB_LLM_MAIN_URL environment variable is required");
}

export const dbLlmCache: Knex = getPgDb(config.dbLlmCacheUrl);
export const dbLlmMain: Knex = getPgDb(config.dbLlmMainUrl);
export const dbConsoleMain: Knex = getPgDb(config.dbConsoleMainUrl);

export async function closeAllDbs(): Promise<void> {
  await closeAll();
}
