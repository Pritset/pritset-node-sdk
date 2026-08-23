import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const node = process.execPath;
const root = await mkdtemp(join(tmpdir(), "pritset-sdk-package-"));

try {
  const packageDirectory = join(root, "package");
  await mkdir(packageDirectory);
  runNpm(["pack", "--pack-destination", packageDirectory], process.cwd());

  const tarball = (await readdir(packageDirectory)).find((file) => file.endsWith(".tgz"));
  if (!tarball) {
    throw new Error("npm pack did not produce a tarball.");
  }
  const tarballPath = join(packageDirectory, tarball);

  await verifyConsumer("esm", "module", 'import { PritsetClient } from "@pritset/sdk";\nif (typeof PritsetClient !== "function") process.exit(1);\n');
  await verifyConsumer("cjs", "commonjs", 'const { PritsetClient } = require("@pritset/sdk");\nif (typeof PritsetClient !== "function") process.exit(1);\n');

  async function verifyConsumer(name, type, source) {
    const directory = join(root, name);
    await mkdir(directory);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ private: true, type }, null, 2),
    );
    await writeFile(join(directory, type === "module" ? "index.mjs" : "index.cjs"), source);
    runNpm(["install", "--offline", "--ignore-scripts", tarballPath], directory);
    execFileSync(node, [type === "module" ? "index.mjs" : "index.cjs"], {
      cwd: directory,
      stdio: "inherit",
    });
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

function runNpm(args, cwd) {
  execFileSync(npm, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}
