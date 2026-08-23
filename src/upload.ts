import { createReadStream } from "node:fs";
import { basename } from "node:path";
import type FormData from "form-data";
import type { Upload } from "./types.js";

export function appendUpload(form: FormData, field: string, upload: Upload): void {
  if (typeof upload.data === "string") {
    if (!upload.data.trim()) {
      throw new TypeError(`${field} path must not be empty.`);
    }
    form.append(field, createReadStream(upload.data), {
      filename: upload.filename ?? basename(upload.data),
      ...(upload.contentType ? { contentType: upload.contentType } : {}),
    });
    return;
  }

  if (!upload.filename?.trim()) {
    throw new TypeError(`${field} filename is required for buffers and streams.`);
  }

  form.append(field, upload.data, {
    filename: upload.filename,
    ...(upload.contentType ? { contentType: upload.contentType } : {}),
  });
}

export function serializeDocumentData(data: import("./types.js").DocumentData): string {
  return typeof data === "string" ? data : JSON.stringify(data);
}
