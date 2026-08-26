import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PritsetApiError, PritsetClient } from "../dist/index.js";

const baseUrl = requiredEnvironment("PRITSET_BASE_URL");
const accessToken = requiredEnvironment("PRITSET_ACCESS_TOKEN");
const secret = requiredEnvironment("PRITSET_SECRET");
const webhookUrl = requiredEnvironment("PRITSET_WEBHOOK_URL");
const templatePath = process.env.PRITSET_TEMPLATE_PATH?.trim()
  || fileURLToPath(new URL("../tests/fixtures/staging-template.docx", import.meta.url));

const target = new URL(baseUrl);
if (target.username || target.password) {
  throw new Error("PRITSET_BASE_URL cannot contain embedded credentials.");
}
if (target.protocol !== "https:" && !isLoopback(target)) {
  throw new Error("PRITSET_BASE_URL must use HTTPS unless it targets an exact loopback host.");
}

const isProduction = target.hostname.toLowerCase() === "api.pritset.com";
if (isProduction && target.href !== "https://api.pritset.com/") {
  throw new Error("Production tests must target exactly https://api.pritset.com.");
}
if (isProduction && process.env.PRITSET_ALLOW_PRODUCTION !== "true") {
  throw new Error("Refusing api.pritset.com without PRITSET_ALLOW_PRODUCTION=true.");
}
if (isProduction && process.env.PRITSET_PRODUCTION_TEST_USER_CONFIRMED !== "true") {
  throw new Error(
    "Refusing api.pritset.com until PRITSET_PRODUCTION_TEST_USER_CONFIRMED=true confirms dedicated test-user credentials.",
  );
}

const callback = new URL(webhookUrl);
if (!new Set(["http:", "https:"]).has(callback.protocol) || callback.username || callback.password) {
  throw new Error("PRITSET_WEBHOOK_URL must be an absolute HTTP(S) URL without embedded credentials.");
}
if (isProduction && callback.protocol !== "https:") {
  throw new Error("PRITSET_WEBHOOK_URL must use HTTPS for a production test.");
}

const runPrefix = process.env.PRITSET_TEST_RUN_PREFIX?.trim() || "pritset-sdk-production-test";
if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(runPrefix)) {
  throw new Error("PRITSET_TEST_RUN_PREFIX must contain 1-48 lowercase letters, digits, or dashes.");
}

await access(templatePath);

const client = new PritsetClient({
  accessToken,
  secret,
  baseUrl,
  allowInsecureHttp: target.protocol === "http:",
  timeoutMs: 120_000,
});

const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const originalName = `${runPrefix}-${runId}`;
const updatedName = `${originalName}-updated`;
const data = {
  title: "Pritset SDK production test-user validation",
  description: `Lifecycle run ${runId}`,
  advantages: [
    { title: "Contract", description: "All public template operations completed." },
    { title: "Cleanup", description: "The temporary template is deleted after validation." },
  ],
};

let templateId;
let deleted = false;
let lifecycleFailed = false;
let creationAttempted = false;

try {
  const valid = await client.templates.validate({
    file: { data: templatePath },
    data,
  });
  assert.equal(valid, true, "Template validation returned false.");
  passed("validate template");

  creationAttempted = true;
  const created = await client.templates.create({
    name: originalName,
    tags: `${runPrefix},node`,
    template: { data: templatePath },
  });
  assert.ok(created.id, "Create response did not include a template ID.");
  templateId = created.id;
  assert.equal(created.name, originalName);
  passed("create template");

  const page = await client.templates.list({ search: originalName, page: 1, pageSize: 100 });
  assert.ok(page.data.some((template) => template.id === templateId), "Created template was not returned by list.");
  passed("list templates");

  const details = await client.templates.get(templateId);
  assert.equal(details.template.id, templateId);
  assert.ok(details.fileInfo.size > 0, "Template details reported an empty file.");
  passed("get template details");

  const updated = await client.templates.update(templateId, {
    name: updatedName,
    tags: `${runPrefix},node,updated`,
  });
  assert.equal(updated.id, templateId);
  assert.equal(updated.name, updatedName);
  passed("update template");

  const download = await client.templates.download(templateId);
  const docx = await download.toBuffer();
  assert.ok(docx.length > 4, "Downloaded template was empty.");
  assert.equal(docx.subarray(0, 2).toString("ascii"), "PK", "Downloaded template was not a DOCX ZIP archive.");
  passed("download template");

  const document = await client.documents.generate(templateId, data);
  const pdf = await document.toBuffer();
  assert.ok(pdf.length > 5, "Generated PDF was empty.");
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-", "Generated document was not a PDF.");
  passed("generate direct PDF");

  const job = await client.documents.generateWebhook(templateId, data, webhookUrl);
  assert.ok(job.id, "Webhook response did not include a job ID.");
  passed("submit webhook PDF generation");

  await client.templates.delete(templateId);
  deleted = true;
  passed("delete template");

  await expectNotFound(() => client.templates.get(templateId));
  passed("confirm deleted template returns 404");

  console.log("Node SDK production test-user lifecycle passed.");
} catch (error) {
  lifecycleFailed = true;
  throw error;
} finally {
  if (templateId && !deleted) {
    try {
      await client.templates.delete(templateId);
      console.log("Cleanup removed the temporary template.");
    } catch (cleanupError) {
      console.error(`Cleanup failed for temporary template ${templateId}.`);
      if (!lifecycleFailed) {
        throw cleanupError;
      }
    }
  }
  if (creationAttempted && !templateId) {
    try {
      const page = await client.templates.list({ search: originalName, page: 1, pageSize: 100 });
      const leakedTemplates = page.data.filter(
        (template) => template.name === originalName || template.name === updatedName,
      );
      for (const template of leakedTemplates) {
        await client.templates.delete(template.id);
        console.log(`Fallback cleanup removed temporary template ${template.id}.`);
      }
    } catch (cleanupError) {
      console.error(`Fallback cleanup failed for temporary template name ${originalName}.`);
      if (!lifecycleFailed) {
        throw cleanupError;
      }
    }
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value || value === "replace-me") {
    throw new Error(`Set ${name} before running the production lifecycle.`);
  }
  return value;
}

function isLoopback(url) {
  return new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname);
}

async function expectNotFound(operation) {
  try {
    await operation();
  } catch (error) {
    if (error instanceof PritsetApiError && error.status === 404) {
      return;
    }
    throw error;
  }
  throw new Error("Deleted template remained accessible.");
}

function passed(step) {
  console.log(`PASS: ${step}`);
}
