import type { AxiosInstance } from "axios";
import type { Readable } from "node:stream";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type DocumentData = JsonValue | string;

export interface PritsetClientOptions {
  accessToken: string;
  secret: string;
  baseUrl?: string;
  timeoutMs?: number;
  allowInsecureHttp?: boolean;
  httpClient?: AxiosInstance;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface Upload {
  data: string | Buffer | Readable;
  filename?: string;
  contentType?: string;
}

export interface Template {
  id: string;
  name: string;
  tags: string | null;
  templateObject: string | null;
}

export interface TemplateFileInfo {
  contentType: string;
  lastModified: string;
  objectName: string;
  size: number;
}

export interface TemplateDetails {
  template: Template;
  fileInfo: TemplateFileInfo;
}

export interface TemplatePage {
  data: Template[];
  total: number;
}

export type SortDirection = 0 | 1;

export interface TemplateSort {
  sortBy: string;
  sortDirection?: SortDirection;
}

export interface ListTemplatesOptions {
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: TemplateSort;
}

export interface CreateTemplateInput {
  name: string;
  tags?: string;
  template: Upload;
}

export interface UpdateTemplateInput {
  name: string;
  tags?: string;
  template?: Upload;
}

export interface ValidateTemplateInput {
  file: Upload;
  data: DocumentData;
}

export interface WebhookJob {
  id: string;
}
