import { Request, Response } from "express";
import { logger as rootLogger, generateSpanId } from "../lib/logger";

export function requestContext(routeLabel?: string) {
  return (req: Request, _res: Response, next: Function) => {
    const spanId = generateSpanId();
    const startTime = Date.now();
    const child = rootLogger.child({
      span_id: spanId,
      route: routeLabel,
      method: req.method,
    });

    req.ctx = {
      spanId,
      startTime,
      logger: child,
      routeLabel: routeLabel,
      method: req.method,
      elapsedMs: () => Date.now() - startTime,
    };

    next();
  };
}
