import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PritsetApiError, PritsetClient, PritsetTransportError } from "../src/index.js";

interface CapturedRequest {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: Buffer;
}

const requests: CapturedRequest[] = [];
const templateListFixture = fixture("templates/list.json");
const templateDetailsFixture = fixture("templates/get.json");
const webhookJobFixture = fixture("documents/webhook-job.json");
const validationProblemFixture = fixture("errors/validation-problem.json");
const server = createServer(async (request, response) => {
  const body = await readRequest(request);
  requests.push({
    method: request.method ?? "",
    url: request.url ?? "",
    headers: request.headers,
    body,
  });
  route(request, response);
});

let baseUrl: string;

beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.close();
  await once(server, "close");
});

beforeEach(() => {
  requests.length = 0;
});

function client(url = baseUrl): PritsetClient {
  return new PritsetClient({
    accessToken: "test-access-token",
    secret: "test-secret",
    baseUrl: url,
    allowInsecureHttp: true,
  });
}

describe("PritsetClient", () => {
  it("requires credentials and HTTPS by default", () => {
    expect(() => new PritsetClient({ accessToken: "", secret: "secret" })).toThrow("accessToken");
    expect(() =>
      new PritsetClient({ accessToken: "token", secret: "secret", baseUrl: "http://example.com" }),
    ).toThrow("HTTPS");
    expect(() =>
      new PritsetClient({
        accessToken: "token",
        secret: "secret",
        baseUrl: "https://user:password@example.com",
      }),
    ).toThrow("credentials");
    expect(() =>
      new PritsetClient({
        accessToken: "token",
        secret: "secret",
        baseUrl: "http://example.com",
        allowInsecureHttp: true,
      }),
    ).toThrow("HTTPS");
  });

  it("does not expose credentials through runtime object inspection", () => {
    const value = client();
    const rendered = inspect(value, { showHidden: true, depth: 10 });
    expect(rendered).not.toContain("test-access-token");
    expect(rendered).not.toContain("test-secret");
  });

  it("lists templates with exact auth headers and query names", async () => {
    const result = await client().templates.list({
      search: "invoice",
      page: 2,
      pageSize: 20,
      sort: { sortBy: "Name", sortDirection: 1 },
    });

    expect(result.total).toBe(1);
    expect(result.data[0]?.name).toBe("Monthly invoice");
    const request = requests[0]!;
    expect(request.headers.authorization).toBe("test-access-token");
    expect(request.headers["x-secret"]).toBe("test-secret");
    expect(request.url).toContain("q=invoice");
    expect(request.url).toContain("p=2");
    expect(request.url).toContain("s=20");
    expect(request.url).toContain("sorts%5B0%5D.sortBy=Name");
    expect(request.url).toContain("sorts%5B0%5D.sortDirection=1");
  });

  it("preserves a path prefix in the configured base URL", async () => {
    const result = await client(`${baseUrl}/proxy`).templates.list();
    expect(result.total).toBe(1);
    expect(requests[0]?.url).toBe("/proxy/api/template");
  });

  it("manages templates and encodes multipart uploads", async () => {
    const created = await client().templates.create({
      name: "Monthly invoice",
      tags: "invoice,monthly",
      template: { data: Buffer.from("fake-docx"), filename: "invoice.docx" },
    });
    expect(created.id).toBe("created-template");
    expect(requests[0]?.headers["content-type"]).toContain("multipart/form-data; boundary=");
    expect(requests[0]?.body.toString()).toContain('name="name"');
    expect(requests[0]?.body.toString()).toContain("Monthly invoice");
    expect(requests[0]?.body.toString()).toContain('filename="invoice.docx"');

    const details = await client().templates.get("created-template");
    expect(details.fileInfo.size).toBe(9);

    const updated = await client().templates.update("created-template", {
      name: "Monthly invoice 2026",
      tags: "invoice,2026",
    });
    expect(updated.name).toBe("Monthly invoice 2026");

    const valid = await client().templates.validate({
      file: { data: Buffer.from("fake-docx"), filename: "invoice.docx" },
      data: { invoiceNumber: "INV-1024" },
    });
    expect(valid).toBe(true);
    const validationBody = requests.at(-1)?.body.toString() ?? "";
    expect(validationBody).toContain('name="file"');
    expect(validationBody).toContain('name="data"');
    expect(validationBody).toContain('"invoiceNumber":"INV-1024"');

    await client().templates.delete("created-template");
    expect(requests.at(-1)?.method).toBe("DELETE");
  });

  it("streams generated PDFs and downloaded templates", async () => {
    const pdf = await client().documents.generate("template-1", { title: "Report" });
    expect(pdf.contentType).toBe("application/pdf");
    expect(pdf.trace).toBe('{"api.total":42}');
    expect(await pdf.toBuffer()).toEqual(Buffer.from("%PDF-1.7 test"));

    const download = await client().templates.download("template-1");
    expect(download.contentType).toContain("wordprocessingml.document");
    expect(await download.toBuffer()).toEqual(Buffer.from("fake-docx"));
  });

  it("starts webhook generation with structured or raw JSON", async () => {
    const job = await client().documents.generateWebhook(
      "template-1",
      '{"title":"Raw JSON"}',
      "https://example.com/webhooks/pritset",
    );
    expect(job.id).toBe("57056f7462084dde8902421e9287ea2d");
    const body = requests[0]?.body.toString() ?? "";
    expect(body).toContain('{"title":"Raw JSON"}');
    expect(body).toContain("https://example.com/webhooks/pritset");
    await expect(
      client().documents.generateWebhook(
        "template-1",
        {},
        "https://user:password@example.com/webhook",
      ),
    ).rejects.toThrow("credentials");
  });

  it("normalizes plain-text and validation-problem errors", async () => {
    await expect(client().templates.get("missing")).rejects.toMatchObject({
      name: "PritsetApiError",
      status: 404,
      rawBody: "Template not found",
    });

    try {
      await client().templates.list({ search: "validation-error" });
      throw new Error("Expected the request to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PritsetApiError);
      const apiError = error as PritsetApiError;
      expect(apiError.status).toBe(400);
      expect(apiError.fieldErrors).toEqual({ Name: ["The Name field is required."] });
      expect(apiError.message).toContain("One or more validation errors occurred.");
    }
  });

  it("does not follow redirects or forward credentials", async () => {
    let redirectedRequestCount = 0;
    const destination = createServer((_request, response) => {
      redirectedRequestCount += 1;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end('{"data":[],"total":0}');
    });
    destination.listen(0, "127.0.0.1");
    await once(destination, "listening");
    const destinationAddress = destination.address() as AddressInfo;

    const redirector = createServer((_request, response) => {
      response.writeHead(302, {
        Location: `http://127.0.0.1:${destinationAddress.port}/stolen`,
      });
      response.end();
    });
    redirector.listen(0, "127.0.0.1");
    await once(redirector, "listening");
    const redirectAddress = redirector.address() as AddressInfo;

    try {
      await expect(client(`http://127.0.0.1:${redirectAddress.port}`).templates.list()).rejects.toBeInstanceOf(
        PritsetApiError,
      );
      expect(redirectedRequestCount).toBe(0);
    } finally {
      redirector.close();
      destination.close();
      await Promise.all([once(redirector, "close"), once(destination, "close")]);
    }
  });

  it("supports cancellation without exposing credentials", async () => {
    const controller = new AbortController();
    controller.abort();
    try {
      await client().templates.list({}, { signal: controller.signal });
      throw new Error("Expected cancellation.");
    } catch (error) {
      expect(error).toBeInstanceOf(PritsetTransportError);
      expect(Object.hasOwn(error as object, "cause")).toBe(false);
      expect(String(error)).not.toContain("test-access-token");
      expect(String(error)).not.toContain("test-secret");
    }
  });
});

async function readRequest(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function route(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/api/template" && url.searchParams.get("q") === "validation-error") {
    json(response, 400, validationProblemFixture);
    return;
  }
  if (request.method === "GET" && (url.pathname === "/api/template" || url.pathname === "/proxy/api/template")) {
    json(response, 200, templateListFixture);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/template") {
    json(response, 200, { id: "created-template", name: "Monthly invoice", tags: "invoice,monthly", templateObject: null });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/template/created-template") {
    json(response, 200, {
      ...templateDetailsFixture,
      template: { ...templateDetailsFixture.template, id: "created-template" },
      fileInfo: { ...templateDetailsFixture.fileInfo, size: 9 },
    });
    return;
  }
  if (request.method === "PUT" && url.pathname === "/api/template/created-template") {
    json(response, 200, { id: "created-template", name: "Monthly invoice 2026", tags: "invoice,2026", templateObject: null });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/template/process/validate") {
    json(response, 200, true);
    return;
  }
  if (request.method === "DELETE" && url.pathname === "/api/template/created-template") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/template/process/direct/template-1") {
    const body = Buffer.from("%PDF-1.7 test");
    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": String(body.length),
      "X-Trace": '{"api.total":42}',
    });
    response.end(body);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/template/download/template-1") {
    const body = Buffer.from("fake-docx");
    response.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Length": String(body.length),
    });
    response.end(body);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/template/process/webhook/template-1") {
    json(response, 200, webhookJobFixture);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/template/missing") {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Template not found");
    return;
  }

  response.writeHead(500, { "Content-Type": "text/plain" });
  response.end(`Unexpected route: ${request.method} ${url.pathname}`);
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

function fixture(path: string): Record<string, any> {
  return JSON.parse(
    readFileSync(new URL(`../contract/fixtures/${path}`, import.meta.url), "utf8"),
  ) as Record<string, any>;
}
