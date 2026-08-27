# Pritset Node SDK

Official Node.js client for managing Pritset DOCX templates and generating PDFs.

> Preview: the package is currently `0.1.5`. Public method names may be refined before `1.0.0`.

## Requirements

- Node.js 18 or newer.
- A Pritset access token and secret from your profile.

Node 22 and 24 are fully tested. Node 18 and 20 compatibility is best effort because those runtimes are outside current upstream support.

## Installation

```bash
npm install @pritset/sdk
```

```bash
pnpm add @pritset/sdk
```

```bash
yarn add @pritset/sdk
```

## Create a client

```ts
import { PritsetClient } from "@pritset/sdk";

const pritset = new PritsetClient({
  accessToken: process.env.PRITSET_ACCESS_TOKEN!,
  secret: process.env.PRITSET_SECRET!,
});
```

The SDK sends the token as the `Authorization` header without adding a `Bearer` prefix. It sends the secret as `X-Secret`. Never expose either value to browser code.

## Generate a PDF

```ts
const pdf = await pritset.documents.generate("YOUR_TEMPLATE_ID", {
  title: "Monthly report",
  totals: { revenue: 12500, currency: "USD" },
});

console.log(pdf.contentType); // application/pdf
await pdf.saveToFile("monthly-report.pdf");
```

Binary responses are stream-first. `saveToFile()` and `toBuffer()` consume the stream, so call only one of them.

Use an `AbortSignal` to cancel a request:

```ts
const controller = new AbortController();
const pdf = await pritset.documents.generate(
  "YOUR_TEMPLATE_ID",
  { title: "Cancelable report" },
  { signal: controller.signal },
);
```

## Template management

### List templates

```ts
const page = await pritset.templates.list({
  search: "invoice",
  page: 1,
  pageSize: 20,
  sort: { sortBy: "Name", sortDirection: 0 },
});

for (const template of page.data) {
  console.log(template.id, template.name);
}
```

### Get and download a template

```ts
const details = await pritset.templates.get("YOUR_TEMPLATE_ID");
console.log(details.fileInfo.objectName, details.fileInfo.size);

const download = await pritset.templates.download("YOUR_TEMPLATE_ID");
await download.saveToFile("template.docx");
```

### Create a template

```ts
const template = await pritset.templates.create({
  name: "Monthly invoice",
  tags: "invoice,monthly",
  template: { data: "./invoice.docx" },
});
```

Buffers and streams require an explicit filename:

```ts
const template = await pritset.templates.create({
  name: "Monthly invoice",
  template: {
    data: docxBuffer,
    filename: "invoice.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
});
```

### Update and delete

```ts
await pritset.templates.update("YOUR_TEMPLATE_ID", {
  name: "Monthly invoice 2026",
  tags: "invoice,monthly,2026",
});

await pritset.templates.delete("YOUR_TEMPLATE_ID");
```

## Validate a template

```ts
const valid = await pritset.templates.validate({
  file: { data: "./invoice.docx" },
  data: { invoiceNumber: "INV-1024", total: "200.00" },
});
```

Template validation uses the same token-and-secret authentication as the other public template operations and is supported by contract `1.0.0`.

## Webhook generation

```ts
const job = await pritset.documents.generateWebhook(
  "YOUR_TEMPLATE_ID",
  { title: "Asynchronous report" },
  "https://example.com/webhooks/pritset",
);

console.log(job.id);
```

Pritset posts the generated PDF to the supplied URL and includes the job ID as an `id` query parameter. The SDK does not run or verify your webhook receiver.

## Raw JSON

Pass a JSON string when exact serialization matters:

```ts
await pritset.documents.generate("YOUR_TEMPLATE_ID", '{"amount":"10.00"}');
```

## Errors

```ts
import { PritsetApiError, PritsetTransportError } from "@pritset/sdk";

try {
  await pritset.templates.get("missing-id");
} catch (error) {
  if (error instanceof PritsetApiError) {
    console.error(error.status, error.fieldErrors, error.retryAfter);
  } else if (error instanceof PritsetTransportError) {
    console.error("The request did not complete.");
  }
}
```

`PritsetApiError` supports field-error JSON, ASP.NET validation-problem JSON, and plain-text errors. Raw error bodies are capped at 64 KiB. Credentials and request bodies are never added to SDK error messages.

The SDK performs no automatic retries. This avoids accidentally repeating document generation or mutations. If you add a retry layer, restrict it to operations that are safe for your application.

## Configuration

```ts
const pritset = new PritsetClient({
  accessToken: process.env.PRITSET_ACCESS_TOKEN!,
  secret: process.env.PRITSET_SECRET!,
  baseUrl: "https://api.pritset.com",
  timeoutMs: 120_000,
});
```

HTTPS is required. For an explicit local test server only:

```ts
const local = new PritsetClient({
  accessToken: "test-token",
  secret: "test-secret",
  baseUrl: "http://127.0.0.1:5000",
  allowInsecureHttp: true,
});
```

Automatic redirects are disabled so credentials cannot be forwarded to another origin.

## CommonJS

```js
const { PritsetClient } = require("@pritset/sdk");
```

## Contract and API documentation

- SDK contract: `pritset/pritset-sdk-contract`, version 1.0.0.
- API documentation: https://pritset.com/docs/api

## Production test-user lifecycle validation

The opt-in production test validates template upload, listing, details, update, download, direct PDF generation, webhook submission, deletion, and the final `404` response. It must use a dedicated production test user. The test creates a uniquely named template and removes it in a `finally` cleanup block.

For a local PowerShell run, copy `.env.example` to `.env`, fill in the dedicated production test-user credentials and controlled webhook URL, and set both production confirmation flags to `true`. The `.env` file is ignored by Git. The launcher reads only known Pritset settings, never prints secret values, and removes them from the process environment afterward:

```powershell
pwsh ./scripts/run-production-test.ps1
```

To use a file in another location:

```powershell
pwsh ./scripts/run-production-test.ps1 -EnvFile C:\secure\pritset-production-test.env
```

The launcher still requires typing `RUN-PRODUCTION-TEST` before it contacts production. The access token must be the raw Pritset token without a `Bearer ` prefix, and the secret must be the matching secret issued with that token.

Set `PRITSET_BASE_URL`, `PRITSET_ACCESS_TOKEN`, `PRITSET_SECRET`, and `PRITSET_WEBHOOK_URL`. For `https://api.pritset.com`, also set both `PRITSET_ALLOW_PRODUCTION=true` and `PRITSET_PRODUCTION_TEST_USER_CONFIRMED=true`, then run:

```bash
npm run production:test
```

The manual `Production test lifecycle` GitHub Actions workflow uses the protected `production-test` environment, hardcodes the target to `https://api.pritset.com`, and requires the operator to type `RUN-PRODUCTION-TEST`. Configure `PRITSET_ACCESS_TOKEN`, `PRITSET_SECRET`, and `PRITSET_WEBHOOK_URL` as environment secrets and configure `PRITSET_PRODUCTION_TEST_USER_CONFIRMED=true` as an environment variable. Add required reviewers and restrict deployment branches for this environment before running it.

The test may consume production test-user credit and create webhook traffic. It never prints credentials and refuses non-HTTPS webhook URLs when pointed at production. A `401` on the first validation request means the token and secret were rejected; no template has been created at that point.

## Contributing and security

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md). Do not include access tokens, secrets, document data, or customer files in issues.

## License

MIT
