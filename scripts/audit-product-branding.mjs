import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "components", "lib", "prisma", "public"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".sql", ".prisma", ".css", ".svg", ".html"]);
const patterns = [
  /Business CRM/gi,
  /Powered by Business CRM/gi,
  /A clearer (?:view|way) to run your business/gi,
];
const allowedLiteralPath = (file) => file === "lib/branding/defaults.ts" || file.startsWith("prisma/migrations/");

async function walk(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(relative));
    else if (extensions.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

const files = (await Promise.all(sourceRoots.map(walk))).flat();
const violations = [];
for (const file of files) {
  if (allowedLiteralPath(file)) continue;
  const content = await readFile(path.join(root, file), "utf8");
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) violations.push(file + ": product name/tagline/footer literal must come from centralized branding");
  }
}
if (violations.length) {
  console.error("Dynamic product-branding audit failed:");
  for (const violation of violations) console.error(" - " + violation);
  process.exitCode = 1;
} else {
  console.log("Dynamic product-branding audit passed: " + files.length + " app/source files scanned.");
  console.log("Temporary defaults are centralized; immutable migration history is exempt.");
}
