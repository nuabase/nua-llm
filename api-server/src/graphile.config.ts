import eventHandlerGraphileJobs from "./event-handler-graphile-jobs";
import { config } from "./lib/config";
import { WorkerPreset } from "graphile-worker";

const preset: GraphileConfig.Preset = {
  extends: [WorkerPreset],
  worker: {
    events: eventHandlerGraphileJobs,
    connectionString: config.dbLlmCacheUrl,
    maxPoolSize: 10,
    // graphile-worker by default uses LISTEN/NOTIFY, polling is used for failed jobs to retry or for future scheduled cron jobs
    pollInterval: 2000,
    preparedStatements: true,
    schema: "graphile_worker",
    crontabFile: "crontab",
    taskDirectory: "dist/bg-tasks",
    concurrentJobs: 6,
    fileExtensions: [".js", ".cjs", ".mjs"],
  },
};

export default preset;
