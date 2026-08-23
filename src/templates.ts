import FormData from "form-data";
import { Transport } from "./transport.js";
import { appendUpload, serializeDocumentData } from "./upload.js";
import type {
  CreateTemplateInput,
  ListTemplatesOptions,
  RequestOptions,
  Template,
  TemplateDetails,
  TemplatePage,
  UpdateTemplateInput,
  ValidateTemplateInput,
} from "./types.js";

export class TemplatesClient {
  readonly #transport: Transport;

  public constructor(transport: Transport) {
    this.#transport = transport;
  }

  public async list(
    options: ListTemplatesOptions = {},
    requestOptions: RequestOptions = {},
  ): Promise<TemplatePage> {
    const query = new URLSearchParams();
    if (options.search !== undefined) query.set("q", options.search);
    if (options.page !== undefined) query.set("p", String(positiveInteger(options.page, "page")));
    if (options.pageSize !== undefined) query.set("s", String(positiveInteger(options.pageSize, "pageSize")));
    if (options.sort) {
      required(options.sort.sortBy, "sort.sortBy");
      query.set("sorts[0].sortBy", options.sort.sortBy);
      query.set("sorts[0].sortDirection", String(options.sort.sortDirection ?? 0));
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.#transport.json<TemplatePage>({
      method: "GET",
      path: `/api/template${suffix}`,
      ...requestOptions,
    });
  }

  public async get(id: string, options: RequestOptions = {}): Promise<TemplateDetails> {
    return this.#transport.json<TemplateDetails>({
      method: "GET",
      path: `/api/template/${encodeId(id)}`,
      ...options,
    });
  }

  public async download(id: string, options: RequestOptions = {}) {
    return this.#transport.binary({
      method: "GET",
      path: `/api/template/download/${encodeId(id)}`,
      ...options,
    });
  }

  public async create(input: CreateTemplateInput, options: RequestOptions = {}): Promise<Template> {
    required(input.name, "name");
    const form = new FormData();
    form.append("name", input.name);
    if (input.tags !== undefined) form.append("tags", input.tags);
    appendUpload(form, "template", input.template);

    return this.#transport.json<Template>({
      method: "POST",
      path: "/api/template",
      data: form,
      headers: form.getHeaders(),
      ...options,
    });
  }

  public async update(
    id: string,
    input: UpdateTemplateInput,
    options: RequestOptions = {},
  ): Promise<Template> {
    required(input.name, "name");
    const form = new FormData();
    form.append("name", input.name);
    if (input.tags !== undefined) form.append("tags", input.tags);
    if (input.template) appendUpload(form, "template", input.template);

    return this.#transport.json<Template>({
      method: "PUT",
      path: `/api/template/${encodeId(id)}`,
      data: form,
      headers: form.getHeaders(),
      ...options,
    });
  }

  public async delete(id: string, options: RequestOptions = {}): Promise<void> {
    await this.#transport.void({
      method: "DELETE",
      path: `/api/template/${encodeId(id)}`,
      ...options,
    });
  }

  public async validate(input: ValidateTemplateInput, options: RequestOptions = {}): Promise<boolean> {
    const form = new FormData();
    appendUpload(form, "file", input.file);
    form.append("data", serializeDocumentData(input.data));

    return this.#transport.json<boolean>({
      method: "POST",
      path: "/api/template/process/validate",
      data: form,
      headers: form.getHeaders(),
      ...options,
    });
  }
}

function encodeId(value: string): string {
  return encodeURIComponent(required(value, "id"));
}

function required(value: string, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must not be empty.`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
}
