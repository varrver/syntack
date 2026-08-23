import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let hash = "dev";
try {
  hash = execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim();
} catch {
  console.warn("git unavailable — using fallback build label");
}

const out = `export const BUILD = "${hash}";
`;
writeFileSync(join(root, "js", "version.js"), out);
console.log(`js/version.js → build ${hash}`);
