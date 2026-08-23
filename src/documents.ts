import FormData from "form-data";
import { Transport } from "./transport.js";
import { serializeDocumentData } from "./upload.js";
import type { DocumentData, RequestOptions, WebhookJob } from "./types.js";

export class DocumentsClient {
  readonly #transport: Transport;

  public constructor(transport: Transport) {
    this.#transport = transport;
  }

  public async generate(
    templateId: string,
    data: DocumentData,
    options: RequestOptions = {},
  ) {
    const form = new FormData();
    form.append("data", serializeDocumentData(data));

    return this.#transport.binary({
      method: "POST",
      path: `/api/template/process/direct/${encodeId(templateId)}`,
      data: form,
      headers: form.getHeaders(),
      ...options,
    });
  }

  public async generateWebhook(
    templateId: string,
    data: DocumentData,
    webhookUrl: string,
    options: RequestOptions = {},
  ): Promise<WebhookJob> {
    validateWebhookUrl(webhookUrl);
    const form = new FormData();
    form.append("data", serializeDocumentData(data));
    form.append("url", webhookUrl);

    return this.#transport.json<WebhookJob>({
      method: "POST",
      path: `/api/template/process/webhook/${encodeId(templateId)}`,
      data: form,
      headers: form.getHeaders(),
      ...options,
    });
  }
}

function encodeId(value: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("templateId must not be empty.");
  }
  return encodeURIComponent(value);
}

function validateWebhookUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("webhookUrl must be an absolute HTTP or HTTPS URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("webhookUrl must be an HTTP or HTTPS URL.");
  }
  if (url.username || url.password) {
    throw new TypeError("webhookUrl must not contain credentials.");
  }
}
