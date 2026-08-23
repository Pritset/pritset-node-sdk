import type { AxiosResponse } from "axios";
import { Readable } from "node:stream";

const MAX_ERROR_BODY_BYTES = 64 * 1024;

export class PritsetApiError extends Error {
  public readonly name = "PritsetApiError";

  public constructor(
    message: string,
    public readonly status: number,
    public readonly fieldErrors: Record<string, string[]>,
    public readonly rawBody: string,
    public readonly retryAfter: string | undefined,
    public readonly trace: string | undefined,
  ) {
    super(message);
  }

  public static async fromResponse(response: AxiosResponse<unknown>): Promise<PritsetApiError> {
    const rawBody = await readErrorBody(response.data);
    const parsed = parseJson(rawBody);
    const fieldErrors = normalizeFieldErrors(parsed);
    const message = errorMessage(response.status, parsed, rawBody, fieldErrors);

    return new PritsetApiError(
      message,
      response.status,
      fieldErrors,
      rawBody,
      header(response, "retry-after"),
      header(response, "x-trace"),
    );
  }
}

export class PritsetTransportError extends Error {
  public readonly name = "PritsetTransportError";

  public constructor(
    message: string,
    public readonly code: string | undefined = undefined,
  ) {
    super(message);
  }
}

function header(response: AxiosResponse<unknown>, name: string): string | undefined {
  const value = response.headers[name];
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value === undefined ? undefined : String(value);
}

async function readErrorBody(data: unknown): Promise<string> {
  if (data === undefined || data === null) {
    return "";
  }
  if (typeof data === "string") {
    return data.slice(0, MAX_ERROR_BODY_BYTES);
  }
  if (Buffer.isBuffer(data)) {
    return data.subarray(0, MAX_ERROR_BODY_BYTES).toString("utf8");
  }
  if (data instanceof Readable) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of data) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = MAX_ERROR_BODY_BYTES - size;
      if (remaining <= 0) {
        data.destroy();
        break;
      }
      chunks.push(buffer.subarray(0, remaining));
      size += Math.min(buffer.length, remaining);
      if (buffer.length > remaining || size >= MAX_ERROR_BODY_BYTES) {
        data.destroy();
        break;
      }
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  try {
    return JSON.stringify(data).slice(0, MAX_ERROR_BODY_BYTES);
  } catch {
    return String(data).slice(0, MAX_ERROR_BODY_BYTES);
  }
}

function parseJson(rawBody: string): unknown {
  if (!rawBody.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return undefined;
  }
}

function normalizeFieldErrors(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) {
    return {};
  }

  if (isRecord(value.errors)) {
    return normalizeErrorRecord(value.errors);
  }

  const excluded = new Set(["type", "title", "status", "traceId", "message"]);
  const candidates = Object.fromEntries(
    Object.entries(value).filter(([key]) => !excluded.has(key)),
  );
  return normalizeErrorRecord(candidates);
}

function normalizeErrorRecord(value: Record<string, unknown>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(value)) {
    if (typeof messages === "string") {
      result[field] = [messages];
    } else if (Array.isArray(messages)) {
      const strings = messages.filter((message): message is string => typeof message === "string");
      if (strings.length > 0) {
        result[field] = strings;
      }
    }
  }
  return result;
}

function errorMessage(
  status: number,
  parsed: unknown,
  rawBody: string,
  fieldErrors: Record<string, string[]>,
): string {
  if (isRecord(parsed)) {
    if (typeof parsed.title === "string" && parsed.title.trim()) {
      return `Pritset API request failed (${status}): ${parsed.title}`;
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return `Pritset API request failed (${status}): ${parsed.message}`;
    }
  }

  const firstFieldMessage = Object.values(fieldErrors)[0]?.[0];
  if (firstFieldMessage) {
    return `Pritset API request failed (${status}): ${firstFieldMessage}`;
  }
  if (rawBody.trim()) {
    return `Pritset API request failed (${status}): ${rawBody.trim()}`;
  }
  return `Pritset API request failed (${status}).`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
