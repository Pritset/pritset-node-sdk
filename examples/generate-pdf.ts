import { PritsetClient } from "../src/index.js";

const accessToken = process.env.PRITSET_ACCESS_TOKEN;
const secret = process.env.PRITSET_SECRET;
const templateId = process.env.PRITSET_TEMPLATE_ID;

if (!accessToken || !secret || !templateId) {
  throw new Error("Set PRITSET_ACCESS_TOKEN, PRITSET_SECRET, and PRITSET_TEMPLATE_ID.");
}

const pritset = new PritsetClient({ accessToken, secret });
const pdf = await pritset.documents.generate(templateId, {
  title: "Hello Pritset",
  description: "Generated with the official Node SDK.",
});

await pdf.saveToFile("generated.pdf");
