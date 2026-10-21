import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".sql", ".prisma", ".css",
  ".svg", ".html", ".md", ".yml", ".yaml", ".toml", ".env", ".example",
]);
const patterns = [
  ["temporary product name", /Business CRM/gi],
  ["product attribution", /Powered by Business CRM/gi],
  ["temporary product tagline", /A clearer (?:view|way) to run your business/gi],
  ["hardcoded primary color CSS variable", /--brand-primary\s*:\s*#[0-9a-f]{6}/gi],
  ["hardcoded uppercase product label", /\bCRM-OM\b/g],
];
const intentionalFiles = (file) =>
  file === "lib/branding/defaults.ts" ||
  file.startsWith("prisma/migrations/") ||
  file.startsWith("tests/") ||
  file === "scripts/audit-product-branding.mjs" ||
  file === "README.md" ||
  file === "IMPLEMENTATION_STATUS.md";
const runtimeFiles = (file) =>
  /^(app|components|lib|public)\//.test(file) ||
  file === "prisma/schema.prisma" ||
  file === "next.config.ts" ||
  file === "next.config.mjs" ||
  file === "package.json" ||
  file === "playwright.config.ts" ||
  file === "tailwind.config.ts" ||
  file === "postcss.config.mjs" ||
  file === "eslint.config.mjs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .map((file) => file.split(path.sep).join("/"))
  .filter((file) => textExtensions.has(path.extname(file)) || file === ".env.example");

const violations = [];
const intentionalHits = [];
for (const file of tracked) {
  const content = await readFile(file, "utf8").catch(() => "");
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (!pattern.test(content)) continue;
    if (intentionalFiles(file)) {
      intentionalHits.push({ file, label });
    } else if (runtimeFiles(file)) {
      violations.push(file + ": " + label + " must come from centralized settings");
    }
  }
}

const structuralRequirements = [
  ["app/layout.tsx", ["getPlatformBranding", "generateMetadata", "brand.productName"]],
  ["components/brand-logo.tsx", ["branding.productName", "branding.logoUrl"]],
  ["components/app-sidebar.tsx", ["BrandLogo"]],
  ["app/login/page.tsx", ["getPlatformBranding", "BrandLogo"]],
  ["app/loading.tsx", ["getPlatformBranding", "BrandLogo"]],
  ["lib/branding/messages.ts", ["getPlatformBranding", "buildSystemEmail", "buildSystemNotification"]],
  ["lib/messaging/resend.ts", ["buildSystemEmail", "RESEND_API_KEY"]],
  ["lib/notifications/service.ts", ["buildSystemNotification", "systemNotification.create"]],
  ["app/(protected)/notifications/page.tsx", ["getPlatformBranding", "NotificationsList"]],
];
for (const [file, required] of structuralRequirements) {
  const content = await readFile(file, "utf8").catch(() => "");
  for (const token of required) {
    if (!content.includes(token)) violations.push(file + ": required centralized branding integration is missing (" + token + ")");
  }
}

if (violations.length) {
  console.error("Repository-wide product-branding audit failed:");
  for (const violation of [...new Set(violations)]) console.error(" - " + violation);
  process.exitCode = 1;
} else {
  console.log("Repository-wide product-branding audit passed (" + tracked.length + " tracked text files scanned).");
  console.log("Application/runtime files use centralized settings for product name, tagline, attribution, primary color, metadata, email, and notification branding.");
  console.log("Intentional default/migration/test/documentation literals found: " + intentionalHits.length + ".");
}
