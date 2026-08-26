import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import type { Readable } from "node:stream";
import { BinaryResponse } from "./binary-response.js";
import { PritsetApiError, PritsetTransportError } from "./errors.js";
import type { PritsetClientOptions, RequestOptions } from "./types.js";

interface RequestConfig extends RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  data?: unknown;
  headers?: Record<string, string>;
}

export class Transport {
  readonly #client: AxiosInstance;
  readonly #accessToken: string;
  readonly #secret: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;

  public constructor(options: PritsetClientOptions) {
    this.#accessToken = requiredSecret(options.accessToken, "accessToken");
    this.#secret = requiredSecret(options.secret, "secret");
    this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? "https://api.pritset.com", options.allowInsecureHttp ?? false);
    this.#timeoutMs = positiveTimeout(options.timeoutMs ?? 120_000);
    this.#client = options.httpClient ?? axios.create();
  }

  public async json<T>(config: RequestConfig): Promise<T> {
    const response = await this.send<unknown>(config, "json");
    return response.data as T;
  }

  public async void(config: RequestConfig): Promise<void> {
    await this.send(config, "json");
  }

  public async binary(config: RequestConfig): Promise<BinaryResponse> {
    const response = await this.send<Readable>(config, "stream");
    return new BinaryResponse(
      response.data,
      header(response, "content-type"),
      numericHeader(response, "content-length"),
      header(response, "x-trace"),
    );
  }

  private async send<T>(config: RequestConfig, responseType: "json" | "stream"): Promise<AxiosResponse<T>> {
    const request: AxiosRequestConfig = {
      method: config.method,
      url: new URL(config.path.replace(/^\//, ""), `${this.#baseUrl}/`).toString(),
      timeout: this.#timeoutMs,
      maxRedirects: 0,
      maxBodyLength: Infinity,
      responseType,
      validateStatus: () => true,
      headers: {
        Authorization: this.#accessToken,
        "X-Secret": this.#secret,
        "User-Agent": "pritset-node-sdk/0.1.5",
        ...config.headers,
      },
      ...(config.data !== undefined ? { data: config.data } : {}),
      ...(config.signal ? { signal: config.signal } : {}),
    };

    let response: AxiosResponse<T>;
    try {
      response = await this.#client.request<T>(request);
    } catch (error) {
      if (error instanceof PritsetApiError) {
        throw error;
      }
      if (error instanceof AxiosError && error.code === "ERR_CANCELED") {
        throw new PritsetTransportError("Pritset API request was canceled.", error.code);
      }
      throw new PritsetTransportError(
        "Pritset API request could not be completed.",
        error instanceof AxiosError ? error.code : undefined,
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw await PritsetApiError.fromResponse(response);
    }
    return response;
  }
}

function normalizeBaseUrl(value: string, allowInsecureHttp: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("baseUrl must be an absolute URL.");
  }

  if (url.username || url.password) {
    throw new TypeError("baseUrl must not contain credentials.");
  }
  if (url.search || url.hash) {
    throw new TypeError("baseUrl must not contain a query string or fragment.");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const allowedLoopbackHttp = allowInsecureHttp && url.protocol === "http:" && loopbackHosts.has(url.hostname);
  if (url.protocol !== "https:" && !allowedLoopbackHttp) {
    throw new TypeError("baseUrl must use HTTPS unless allowInsecureHttp is enabled.");
  }

  return url.toString().replace(/\/$/, "");
}

function requiredSecret(value: string, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must not be empty.`);
  }
  return value;
}

function positiveTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError("timeoutMs must be a positive number.");
  }
  return value;
}

function header(response: AxiosResponse<unknown>, name: string): string | undefined {
  const value = response.headers[name];
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value === undefined ? undefined : String(value);
}

function numericHeader(response: AxiosResponse<unknown>, name: string): number | undefined {
  const value = header(response, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
