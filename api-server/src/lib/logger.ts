import winston from "winston";
import { randomUUID } from "crypto";

// Pretty format for development
function formatValue(value: any, indent = 0) {
  const spaces = "  ".repeat(indent);

  if (typeof value === "string") {
    // Check if string contains newlines
    if (value.includes("\n")) {
      // Format as multi-line string with proper indentation
      const lines = value.split("\n");
      return "`" + lines.join("\n" + spaces) + "`";
    }
    return `'${value}'`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";

    let result = "[\n";
    value.forEach((item, i) => {
      result += spaces + "  " + formatValue(item, indent + 1);
      if (i < value.length - 1) result += ",";
      result += "\n";
    });
    result += spaces + "]";
    return result;
  }

  if (value && typeof value === "object" && value !== null) {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";

    let result = "{\n";
    keys.forEach((key, i) => {
      const formattedValue = formatValue(value[key], indent + 1);
      result += spaces + "  " + key + ": " + formattedValue;
      if (i < keys.length - 1) result += ",";
      result += "\n";
    });
    result += spaces + "}";
    return result;
  }

  return JSON.stringify(value);
}

// Dev formatting - pretty text with multi-line handling (opt-in via LOG_PRETTY=true)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let output = `${timestamp} [${level.toUpperCase()}] ${message}`;

    if (Object.keys(meta).length > 0) {
      output += "\n" + formatValue(meta);
    }

    return output;
  }),
);

// Compact JSON format for production
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Use JSON logs by default in all environments; pretty printing only when explicitly enabled.
const logFormat =
  (process.env.LOG_PRETTY || "").toLowerCase() === "true"
    ? devFormat
    : prodFormat;

// Transports: stdout/stderr only in production; add files in non-production
const baseConsoleTransport = new winston.transports.Console({
  stderrLevels: ["error"],
  consoleWarnLevels: ["warn"],
});

const transports: winston.transport[] = [baseConsoleTransport];

if ((process.env.NODE_ENV || "development") !== "production") {
  transports.push(
    new winston.transports.File({
      filename: "logs/agent-error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "logs/agent-combined.log",
    }),
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "api" },
  transports,
});

export const generateSpanId = (): string => randomUUID();

export const logApiCallStart = (
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

export { logger };
export default logger;
