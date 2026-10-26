import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../../generated/prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

type Sample = { status: number | null; ms: number; ok: boolean; id?: string; error?: string };

function percentile(values: number[], percent: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(percent * sorted.length) - 1)].toFixed(2));
}

function summarize(phase: string, elapsedMs: number, samples: Sample[]) {
  const times = samples.map((sample) => sample.ms).filter(Number.isFinite);
  const statuses: Record<string, number> = {};
  for (const sample of samples) {
    const key = sample.status === null ? "NETWORK_ERROR" : String(sample.status);
    statuses[key] = (statuses[key] || 0) + 1;
  }
  return {
    phase,
    requests: samples.length,
    successful: samples.filter((sample) => sample.ok).length,
    failed: samples.filter((sample) => !sample.ok).length,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    requestsPerSecond: Number((samples.length / Math.max(elapsedMs / 1000, 0.001)).toFixed(2)),
    statusCounts: statuses,
    latencyMs: {
      p50: percentile(times, 0.5),
      p95: percentile(times, 0.95),
      p99: percentile(times, 0.99),
      max: times.length ? Number(Math.max(...times).toFixed(2)) : null,
    },
    sampleErrors: samples.filter((sample) => !sample.ok).slice(0, 8).map(({ status, error }) => ({ status, error })),
  };
}

test("CRM customer API survives 1,000 simultaneous synthetic customer operations", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(600_000);
  const count = Number(process.env.LOAD_TEST_COUNT || "1000");
  expect(Number.isInteger(count) && count >= 1 && count <= 1000).toBeTruthy();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the isolated CI workload test.");
  const databaseHost = new URL(databaseUrl).hostname;
  if (databaseHost !== "127.0.0.1" && databaseHost !== "localhost") {
    throw new Error("Refusing to write load-test records outside the isolated CI database.");
  }
  if (!baseURL) throw new Error("Playwright baseURL is required.");

  const runId = randomUUID();
  const email = "loadtest-" + runId + "@example.test";
  const password = "Load-Test-Only-Password-2026!";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  let tenantId: string | undefined;
  let userId: string | undefined;
  const createdIds = new Set<string>();
  const report: Record<string, unknown> = {
    runId,
    count,
    concurrency: count,
    target: "isolated CI Next.js server + fresh PostgreSQL service",
  };

  async function apiRequest(
    method: "GET" | "POST" | "DELETE",
    url: string,
    body?: Record<string, unknown>,
  ): Promise<Sample> {
    const started = performance.now();
    try {
      const response = await page.context().request.fetch(url, {
        method,
        headers: {
          origin: baseURL!,
          referer: baseURL! + "/crm/customers",
        },
        data: body,
        timeout: 120_000,
      });
      const payload: any = await response.json().catch(() => null);
      const id = typeof payload?.data?.id === "string" ? payload.data.id : undefined;
      if (id) createdIds.add(id);
      const ok = method === "POST"
        ? response.status() === 201 && Boolean(id)
        : method === "GET"
          ? response.status() === 200 && Array.isArray(payload?.data)
          : response.status() === 200 && payload?.data?.deleted === true;
      return {
        status: response.status(),
        ms: performance.now() - started,
        ok,
        id,
        ...(!ok ? { error: String(payload?.error?.message || "Unexpected response payload").slice(0, 200) } : {}),
      };
    } catch (error) {
      return {
        status: null,
        ms: performance.now() - started,
        ok: false,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 200),
      };
    }
  }

  try {
    const tenant = await prisma.tenant.create({ data: { slug: "load-" + runId.slice(0, 32) } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        name: "Isolated Customer Load Test Admin",
        email,
        passwordHash: await hash(password, 10),
        role: UserRole.TENANT_ADMIN,
        tenantId,
      },
    });
    userId = user.id;

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard(?:$|\?)/, { timeout: 30_000 });

    const customersUrl = new URL("/api/v1/crm/customers", baseURL).toString();

    console.info("CUSTOMER_LOAD_PHASE=create start count=" + count + " concurrency=" + count);
    {
      const started = performance.now();
      const samples = await Promise.all(Array.from({ length: count }, (_, index) => apiRequest(
        "POST",
        customersUrl,
        {
          name: "CRM Load Test Customer " + String(index + 1).padStart(4, "0"),
          company: "Synthetic Load Test",
          email: "customer-" + runId + "-" + index + "@example.invalid",
          phone: "+910000" + String(index).padStart(6, "0"),
          address: "Ephemeral CI load-test data",
          creditLimit: 50000,
          paymentTermsDays: 30,
          notes: "AUTOGENERATED LOAD TEST ONLY; runId=" + runId,
        },
      )));
      report.create = summarize("create_customers", performance.now() - started, samples);
    }
    console.info("CUSTOMER_LOAD_PHASE=read start count=" + count + " concurrency=" + count);
    {
      const started = performance.now();
      const samples = await Promise.all(Array.from({ length: count }, () => apiRequest("GET", customersUrl)));
      report.read = summarize("list_customers", performance.now() - started, samples);
    }
    console.info("CUSTOMER_LOAD_PHASE=cleanup start count=" + createdIds.size + " concurrency=" + createdIds.size);
    {
      const started = performance.now();
      const ids = [...createdIds];
      const samples = await Promise.all(ids.map((id) => apiRequest("DELETE", customersUrl + "/" + encodeURIComponent(id))));
      report.cleanup = summarize("delete_customers", performance.now() - started, samples);
    }

    const create = report.create as ReturnType<typeof summarize>;
    const read = report.read as ReturnType<typeof summarize>;
    const cleanup = report.cleanup as ReturnType<typeof summarize>;
    report.pass = create.successful === count
      && read.successful === count
      && cleanup.successful === createdIds.size;
    report.createdIdsReturned = createdIds.size;
    report.finishedAt = new Date().toISOString();
    console.info("CUSTOMER_LOAD_REPORT=" + JSON.stringify(report));
    await mkdir("artifacts", { recursive: true });
    await writeFile("artifacts/customer-load-report.json", JSON.stringify(report, null, 2) + "\n", "utf8");
    expect(create.successful, "customer creates must all succeed; see CUSTOMER_LOAD_REPORT").toBe(count);
    expect(read.successful, "customer list reads must all succeed; see CUSTOMER_LOAD_REPORT").toBe(count);
    expect(cleanup.successful, "all created test customers must be removed; see CUSTOMER_LOAD_REPORT").toBe(createdIds.size);
  } finally {
    // Disposable CI DB cleanup is a final safety net if any API delete failed or a request timed out.
    if (userId) await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
