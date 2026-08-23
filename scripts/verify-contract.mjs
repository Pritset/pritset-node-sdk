import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const directory = new URL("../contract/", import.meta.url);
const lock = JSON.parse(await readFile(new URL("contract.lock.json", directory), "utf8"));
const openapi = await readFile(new URL("openapi.yaml", directory));
const digest = createHash("sha256").update(openapi).digest("hex");

if (digest !== lock.openapiSha256) {
  throw new Error(`Vendored OpenAPI hash ${digest} does not match contract.lock.json.`);
}

const text = openapi.toString("utf8");
if (!text.includes(`  version: ${lock.contractVersion}`)) {
  throw new Error("Vendored OpenAPI version does not match contract.lock.json.");
}

for (const path of [
  "fixtures/templates/list.json",
  "fixtures/templates/get.json",
  "fixtures/documents/webhook-job.json",
  "fixtures/errors/field-errors.json",
  "fixtures/errors/validation-problem.json",
  "fixtures/errors/plain-text.txt",
]) {
  await readFile(new URL(path, directory));
}
