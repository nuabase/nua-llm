import { User } from "../models/users-model";
import type { Logger } from "winston";

declare global {
  namespace Express {
    interface RequestContext {
      spanId: string;
      startTime: number;
      /** Child logger enriched with span and route metadata */
      logger: Logger;
      /** Helper to compute elapsed time since start */
      elapsedMs: () => number;
      /** Optional route descriptor for logs */
      routeLabel?: string;
      /** HTTP method */
      method?: string;
    }

    interface Request {
      /** Request-scoped context for logging/timing */
      ctx?: RequestContext;
      /** Authenticated user when available */
      user?: User;
      endConsumerId: string | null;
    }
  }
}

export {};
