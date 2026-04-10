import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..");
const SERVER_URL = "http://localhost:8000";

interface CliResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/**
 * Run the CLI via tsx against the live server.
 */
function run(...args: string[]): CliResult {
	try {
		const stdout = execFileSync("npx", ["tsx", "src/bin/agno-os.ts", "--url", SERVER_URL, ...args], {
			cwd: PROJECT_ROOT,
			encoding: "utf-8",
			timeout: 15000,
		});
		return { stdout, stderr: "", exitCode: 0 };
	} catch (err: unknown) {
		const e = err as { stdout?: string; stderr?: string; status?: number };
		return {
			stdout: e.stdout ?? "",
			stderr: e.stderr ?? "",
			exitCode: e.status ?? 1,
		};
	}
}

/**
 * Run the CLI with JSON output and parse the response.
 */
function runJson(...args: string[]): { result: CliResult; parsed: Record<string, unknown> | null } {
	const result = run("--output", "json", ...args);
	let parsed: Record<string, unknown> | null = null;
	try {
		parsed = JSON.parse(result.stdout) as Record<string, unknown>;
	} catch {
		// JSON parse failed - leave as null
	}
	return { result, parsed };
}

describe("Live integration tests (requires AgentOS at localhost:8000)", () => {
	describe("status", () => {
		it("returns table output containing OS info", () => {
			const result = run("--output", "table", "status");
			expect(result.exitCode).toBe(0);
			// Table output should contain labels like "OS ID" or "Name"
			expect(result.stdout).toMatch(/OS ID|Name/);
		});

		it("returns JSON with os_id field", () => {
			const { result, parsed } = runJson("status");
			expect(result.exitCode).toBe(0);
			expect(parsed).not.toBeNull();
			expect(parsed).toHaveProperty("os_id");
		});
	});

	describe("agent list", () => {
		it("returns valid JSON with data array", () => {
			const { result, parsed } = runJson("agent", "list");
			expect(result.exitCode).toBe(0);
			expect(parsed).not.toBeNull();
			expect(parsed).toHaveProperty("data");
			expect(Array.isArray(parsed?.data)).toBe(true);
		});

		it("each agent has id and name fields", () => {
			const { parsed } = runJson("agent", "list");
			const data = parsed?.data as Record<string, unknown>[];
			expect(data.length).toBeGreaterThan(0);
			expect(data[0]).toHaveProperty("id");
			expect(data[0]).toHaveProperty("name");
		});

		it("respects --limit flag and includes pagination meta", () => {
			const { parsed } = runJson("agent", "list", "--limit", "1");
			const data = parsed?.data as Record<string, unknown>[];
			expect(data.length).toBeLessThanOrEqual(1);
			expect(parsed).toHaveProperty("meta");
			const meta = parsed?.meta as Record<string, unknown>;
			expect(meta.limit).toBe(1);
		});
	});

	describe("agent get", () => {
		it("returns agent details for a valid agent ID", async () => {
			// First get an agent ID from the list
			const { parsed: listResult } = runJson("agent", "list", "--limit", "1");
			const agents = listResult?.data as Record<string, unknown>[];
			expect(agents.length).toBeGreaterThan(0);

			const agentId = agents[0].id as string;
			const { result, parsed } = runJson("agent", "get", agentId);
			expect(result.exitCode).toBe(0);
			expect(parsed).not.toBeNull();
			expect(parsed).toHaveProperty("id", agentId);
		});
	});

	describe("team list", () => {
		it("returns valid JSON with data array", () => {
			const { result, parsed } = runJson("team", "list");
			expect(result.exitCode).toBe(0);
			expect(parsed).not.toBeNull();
			expect(parsed).toHaveProperty("data");
			expect(Array.isArray(parsed?.data)).toBe(true);
		});
	});

	describe("workflow list", () => {
		it("returns valid JSON with data array", () => {
			const { result, parsed } = runJson("workflow", "list");
			expect(result.exitCode).toBe(0);
			expect(parsed).not.toBeNull();
			expect(parsed).toHaveProperty("data");
			expect(Array.isArray(parsed?.data)).toBe(true);
		});
	});

	describe("models list", () => {
		it("returns valid JSON with data array", () => {
			const { result, parsed } = runJson("models", "list");
			expect(result.exitCode).toBe(0);
			expect(parsed).not.toBeNull();
			expect(parsed).toHaveProperty("data");
			expect(Array.isArray(parsed?.data)).toBe(true);
		});
	});

	describe("metrics get", () => {
		it("returns valid JSON or reports db-id error on multi-db setup", () => {
			const result = run("--output", "json", "metrics", "get");
			// Metrics may require --db-id on multi-database servers (SDK limitation)
			if (result.exitCode === 0) {
				const parsed = JSON.parse(result.stdout);
				expect(parsed).toHaveProperty("metrics");
			} else {
				// Expected on multi-database setups where db_id is required
				expect(result.stderr).toContain("db_id");
			}
		});
	});

	describe("metrics refresh", () => {
		it("completes without unhandled error or reports db-id requirement", () => {
			const result = run("metrics", "refresh");
			// May require --db-id on multi-database servers (SDK limitation)
			if (result.exitCode === 0) {
				expect(result.stderr).toContain("Metrics refresh triggered");
			} else {
				expect(result.stderr).toContain("db_id");
			}
		});
	});

	describe("help", () => {
		it("shows all new commands in help output", () => {
			const result = run("--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("status");
			expect(result.stdout).toContain("agent");
			expect(result.stdout).toContain("team");
			expect(result.stdout).toContain("workflow");
			expect(result.stdout).toContain("models");
			expect(result.stdout).toContain("metrics");
		});
	});
});
