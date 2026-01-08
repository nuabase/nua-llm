import { makeWorkerUtils, WorkerUtils } from "graphile-worker";
import { config } from "./config";

let workerUtils: WorkerUtils;

async function initWorkerUtils() {
  workerUtils = await makeWorkerUtils({
    connectionString: config.dbLlmCacheUrl,
  });
}

export { workerUtils, initWorkerUtils };
