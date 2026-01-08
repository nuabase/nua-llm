import { workerUtils } from "./lib/graphile-worker-utils";
import { Job, Worker, WorkerEvents } from "graphile-worker";
import EventEmitter from "node:events";
const events: WorkerEvents = new EventEmitter();

events.on(
  "job:failed",
  ({ worker, job, error }: { worker: Worker; job: Job; error: any }) => {
    console.log("JOB FAILED GRAPHILE");
    console.log(workerUtils, "workerUtils");
    console.log(job, "job");
  },
);

export default events;
