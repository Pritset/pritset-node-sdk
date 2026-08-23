import { PritsetClient } from "../src/index.js";

const accessToken = process.env.PRITSET_ACCESS_TOKEN;
const secret = process.env.PRITSET_SECRET;

if (!accessToken || !secret) {
  throw new Error("Set PRITSET_ACCESS_TOKEN and PRITSET_SECRET.");
}

const pritset = new PritsetClient({ accessToken, secret });
const created = await pritset.templates.create({
  name: `SDK example ${Date.now()}`,
  tags: "sdk,example",
  template: { data: "./invoice.docx" },
});

try {
  const details = await pritset.templates.get(created.id);
  console.log(details.template.name);
} finally {
  await pritset.templates.delete(created.id);
}
