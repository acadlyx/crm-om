import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const base = new URL(baseUrl);
if (!["127.0.0.1", "localhost"].includes(base.hostname)) {
  throw new Error("This load test deliberately refuses non-local hosts to protect production and shared data.");
}

const count = Number(process.env.LOAD_TEST_COUNT || 1000);
if (!Number.isInteger(count) || count < 1 || count > 1000) {
  throw new Error("LOAD_TEST_COUNT must be an integer from 1 through 1000.");
}
const email = process.env.LOAD_TEST_EMAIL;
const password = process.env.LOAD_TEST_PASSWORD;
if (!email || !password) throw new Error("LOAD_TEST_EMAIL and LOAD_TEST_PASSWORD are required.");

const cookieJar = new Map();
function ingestCookies(response) {
  const lines = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  for (const line of lines) {
    const first = line.split(";")[0];
    const separator = first.indexOf("=");
    if (separator <= 0) continue;
    const name = first.slice(0, separator).trim();
    const value = first.slice(separator + 1);
    if (/max-age=0/i.test(line)) cookieJar.delete(name);
    else cookieJar.set(name, value);
  }
}
function cookieHeader() {
  return [...cookieJar.entries()].map(([name, value]) => name + "=" + value).join("; ");
}
async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { return { _parseError: text.slice(0, 250) }; }
}
async function signIn() {
  const csrfResponse = await fetch(baseUrl + "/api/auth/csrf");
  ingestCookies(csrfResponse);
  if (!csrfResponse.ok) throw new Error("CSRF endpoint returned HTTP " + csrfResponse.status);
  const csrf = await readJson(csrfResponse);
  if (!csrf.csrfToken) throw new Error("CSRF response did not contain a token.");

  const callbackResponse = await fetch(baseUrl + "/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
      origin: baseUrl,
      referer: baseUrl + "/login",
    },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      callbackUrl: baseUrl + "/dashboard",
      json: "true",
      email,
      password,
    }),
    redirect: "manual",
  });
  ingestCookies(callbackResponse);
  const callbackBody = await readJson(callbackResponse);
  if (!(callbackResponse.ok || [302, 303].includes(callbackResponse.status))) {
    throw new Error("Credentials callback returned HTTP " + callbackResponse.status + ".");
  }

  const sessionResponse = await fetch(baseUrl + "/api/auth/session", {
    headers: { cookie: cookieHeader() },
  });
  const session = await readJson(sessionResponse);
  if (!sessionResponse.ok || session?.user?.email?.toLowerCase() !== email.toLowerCase()) {
    throw new Error("Local test login could not be verified (HTTP " + sessionResponse.status + "). No load records were written.");
  }
  console.info("Authenticated local test session verified.");
}

function percentile(values, percent) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(percent * sorted.length) - 1)].toFixed(2));
}
function summarize(name, startedAt, results) {
  const elapsedMs = performance.now() - startedAt;
  const latencies = results.map((result) => result.ms).filter(Number.isFinite);
  const statusCounts = {};
  for (const result of results) {
    const label = result.status == null ? "NETWORK_ERROR" : String(result.status);
    statusCounts[label] = (statusCounts[label] || 0) + 1;
  }
  const summary = {
    phase: name,
    submittedRequests: results.length,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    requestsPerSecond: Number((results.length / Math.max(elapsedMs / 1000, 0.001)).toFixed(2)),
    successfulRequests: results.filter((result) => result.ok).length,
    failedRequests: results.filter((result) => !result.ok).length,
    statusCounts,
    latencyMs: {
      p50: percentile(latencies, 0.50),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.length ? Number(Math.max(...latencies).toFixed(2)) : null,
    },
    sampleErrors: results.filter((result) => !result.ok).slice(0, 8).map(({ status, error }) => ({ status, error })),
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
async function request(method, url, { body, origin = false } = {}) {
  const started = performance.now();
  try {
    const headers = { cookie: cookieHeader() };
    if (origin) {
      headers.origin = baseUrl;
      headers.referer = baseUrl + "/crm/customers";
    }
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    const json = await readJson(response);
    return { status: response.status, ms: performance.now() - started, json, ok: false };
  } catch (error) {
    return { status: null, ms: performance.now() - started, error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

await signIn();
const runId = "crm-load-" + randomUUID();
const report = {
  runId,
  baseUrl,
  count,
  concurrency: count,
  notes: "All data is written to a fresh, ephemeral GitHub Actions PostgreSQL service and removed through the same tenant-scoped API after the read phase.",
  phases: {},
};
const customersUrl = baseUrl + "/api/v1/crm/customers";

console.info("Phase 1/3: creating " + count + " synthetic customers with all requests launched concurrently.");
{
  const startedAt = performance.now();
  const results = await Promise.all(Array.from({ length: count }, (_, index) => request("POST", customersUrl, {
    origin: true,
    body: {
      name: "CRM Load Test Customer " + String(index + 1).padStart(4, "0"),
      company: "Synthetic Load Test",
      email: "load-" + runId + "-" + index + "@example.invalid",
      phone: "+910000" + String(index).padStart(6, "0"),
      address: "Ephemeral CI test data",
      creditLimit: 50000,
      paymentTermsDays: 30,
      notes: "AUTOGENERATED LOAD TEST ONLY; runId=" + runId,
    },
  })));
  const normalized = results.map((result) => ({
    ...result,
    ok: result.status === 201 && Boolean(result.json?.data?.id),
  }));
  report.phases.create = summarize("create_customers", startedAt, normalized);
  report.createdIds = normalized.map((result) => result.json?.data?.id).filter((id) => typeof id === "string");
  console.info("Created customer records returned by API: " + report.createdIds.length + "/" + count);
}

console.info("Phase 2/3: sending " + count + " concurrent reads against the customer list while the synthetic dataset exists.");
{
  const startedAt = performance.now();
  const results = await Promise.all(Array.from({ length: count }, () => request("GET", customersUrl)));
  const normalized = results.map((result) => ({
    ...result,
    ok: result.status === 200 && Array.isArray(result.json?.data),
  }));
  report.phases.read = summarize("list_customers", startedAt, normalized);
}

console.info("Phase 3/3: removing every successfully created synthetic customer.");
{
  const startedAt = performance.now();
  const results = await Promise.all(report.createdIds.map((id) => request(
    "DELETE", customersUrl + "/" + encodeURIComponent(id), { origin: true },
  )));
  const normalized = results.map((result) => ({
    ...result,
    ok: result.status === 200 && result.json?.data?.deleted === true,
  }));
  report.phases.cleanup = summarize("cleanup_customers", startedAt, normalized);
}

report.finishedAt = new Date().toISOString();
report.cleanedUp = report.phases.cleanup.successfulRequests;
report.cleanupFailures = report.phases.cleanup.failedRequests;
report.pass = report.phases.create.successfulRequests === count
  && report.phases.read.successfulRequests === count
  && report.phases.cleanup.successfulRequests === report.createdIds.length
  && report.createdIds.length === count;

await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/customer-load-report.json", JSON.stringify(report, null, 2) + "\n", "utf8");
console.info("Load report written to artifacts/customer-load-report.json");
console.info("FINAL_RESULT=" + (report.pass ? "PASS" : "FAIL"));
if (!report.pass) process.exitCode = 1;
