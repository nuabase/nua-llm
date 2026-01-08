import { randomUUID } from "node:crypto";

export interface Logger {
  debug(message: string, context?: object): void;
  info(message: string, context?: object): void;
  warn(message: string, context?: object): void;
  error(message: string, context?: object): void;
}

export class ConsoleLogger implements Logger {
  debug(message: string, context?: object): void {
    console.debug(`[DEBUG] ${message}`, context || "");
  }
  info(message: string, context?: object): void {
    console.info(`[INFO] ${message}`, context || "");
  }
  warn(message: string, context?: object): void {
    console.warn(`[WARN] ${message}`, context || "");
  }
  error(message: string, context?: object): void {
    console.error(`[ERROR] ${message}`, context || "");
  }
}

export const generateSpanId = (): string => randomUUID();

export const logApiCallStart = (
  logger: Logger,
  spanId: string,
  service: string,
  method: string,
  fullRequest: any,
) => {
  logger.info("API call started", {
    type: "api_call_start",
    span_id: spanId,
    service,
    method,
    request: fullRequest,
  });
};

export const logApiCallComplete = (
  logger: Logger,
  spanId: string,
  service: string,
  method: string,
  fullResponse: any,
  duration: number,
) => {
  logger.info("API call completed", {
    type: "api_call_complete",
    span_id: spanId,
    service,
    method,
    response: fullResponse,
    duration_ms: duration,
  });
};

export const logApiCallError = (
  logger: Logger,
  spanId: string,
  service: string,
  method: string,
  error: any,
  duration: number,
) => {
  logger.error("API call failed", {
    type: "api_call_error",
    span_id: spanId,
    service,
    method,
    error:
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : String(error),
    duration_ms: duration,
  });
};
