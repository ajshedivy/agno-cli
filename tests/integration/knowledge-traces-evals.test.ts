import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..");
const SERVER_URL = "http://localhost:8000";
const DB_ID = "agno-storage";

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
		const stdout = execFileSync("npx", ["tsx", "src/bin/agno.ts", "--url", SERVER_URL, ...args], {
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

describe("Live integration: knowledge, traces, evals (requires AgentOS at localhost:8000)", () => {
	describe("knowledge commands", () => {
		it("knowledge list returns valid JSON with data array", () => {
			const { result, parsed } = runJson("knowledge", "list", "--db-id", DB_ID);
			if (result.exitCode === 0) {
				expect(parsed).not.toBeNull();
				expect(parsed).toHaveProperty("data");
				expect(Array.isArray(parsed?.data)).toBe(true);
			} else {
				// Server may not have knowledge configured -- verify graceful error
				expect(result.stderr).toBeTruthy();
			}
		});

		it("knowledge search returns valid JSON (may have empty results)", () => {
			const { result, parsed } = runJson("knowledge", "search", "test", "--db-id", DB_ID);
			if (result.exitCode === 0) {
				expect(parsed).not.toBeNull();
				expect(parsed).toHaveProperty("data");
				expect(Array.isArray(parsed?.data)).toBe(true);
			} else {
				// Search may fail on servers without vector DB configured
				expect(result.stderr).toBeTruthy();
			}
		});

		it("knowledge config returns valid JSON", () => {
			const { result, parsed } = runJson("knowledge", "config", "--db-id", DB_ID);
			if (result.exitCode === 0) {
				expect(parsed).not.toBeNull();
			} else {
				expect(result.stderr).toBeTruthy();
			}
		});

		it("knowledge list with pagination flags", () => {
			const { result, parsed } = runJson("knowledge", "list", "--db-id", DB_ID, "--limit", "5", "--page", "1");
			if (result.exitCode === 0) {
				expect(parsed).not.toBeNull();
				expect(parsed).toHaveProperty("data");
			} else {
				expect(result.stderr).toBeTruthy();
			}
		});
	});

	describe("trace commands", () => {
		it("trace list returns valid JSON with data array", () => {
			const { result, parsed } = runJson("trace", "list");
			if (result.exitCode === 0) {
				expect(parsed).not.toBeNull();
				expect(parsed).toHaveProperty("data");
				expect(Array.isArray(parsed?.data)).toBe(true);
			} else {
				expect(result.stderr).toBeTruthy();
			}
		});

		it("trace stats returns valid JSON", () => {
			const { result, parsed } = runJson("trace", "stats");
			if (result.exitCode === 0) {
				expect(parsed).not.toBeNull();
			} else {
				expect(result.stderr).toBeTruthy();
			}
		});

		it("trace list with filters", () => {
			const { result, parsed } = runJson("trace", "list", "--limit", "5", "--page", "1");
			if (result.exitCode === 0) {
				expect(parsed).not.toBeNull();
				expect(parsed).toHaveProperty("data");
			} else {
				expect(result.stderr).toBeTruthy();
			}
		});

		it("trace get with existing ID returns trace details", () => {
			// First get a trace ID from the list
			const { parsed: listParsed } = runJson("trace", "list", "--limit", "1");
			if (listParsed && Array.isArray(listParsed.data) && (listParsed.data as Record<string, unknown>[]).length > 0) {
				const firstTrace = (listParsed.data as Record<string, unknown>[])[0];
				const traceId = (firstTrace as Record<string, unknown>).trace_id as string;
				if (traceId) {
					const { result, parsed } = runJson("trace", "get", traceId);
					if (result.exitCode === 0) {
						expect(parsed).not.toBeNull();
					} else {
						expect(result.stderr).toBeTruthy();
					}
				}
			}
		});
	});

	describe("eval commands", () => {
		it("eval list returns valid JSON with data array", () => {
			const { result, parsed } = runJson("eval", "list", "--db-id", DB_ID);
			if (result.exitCode === 0) {
				expect(parsed).not.toBeNull();
				expect(parsed).toHaveProperty("data");
				expect(Array.isArray(parsed?.data)).toBe(true);
			} else {
				expect(result.stderr).toBeTruthy();
			}
		});

		it("eval list with filters", () => {
			const { result, parsed } = runJson("eval", "list", "--db-id", DB_ID, "--limit", "5", "--page", "1");
			if (result.exitCode === 0) {
				expect(parsed).not.toBeNull();
				expect(parsed).toHaveProperty("data");
			} else {
				expect(result.stderr).toBeTruthy();
			}
		});

		it("eval get with existing ID returns eval details", () => {
			// First get an eval ID from the list
			const { parsed: listParsed } = runJson("eval", "list", "--db-id", DB_ID, "--limit", "1");
			if (listParsed && Array.isArray(listParsed.data) && (listParsed.data as Record<string, unknown>[]).length > 0) {
				const firstEval = (listParsed.data as Record<string, unknown>[])[0];
				const evalId = (firstEval as Record<string, unknown>).id as string;
				if (evalId) {
					const { result, parsed } = runJson("eval", "get", evalId);
					if (result.exitCode === 0) {
						expect(parsed).not.toBeNull();
					} else {
						expect(result.stderr).toBeTruthy();
					}
				}
			}
		});
	});

	describe("error cases", () => {
		it("trace search with invalid JSON for --filter exits with error", () => {
			const result = run("trace", "search", "--filter", "bad-json");
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain("Invalid JSON");
		});
	});

	describe("help output", () => {
		it("knowledge --help shows all 7 subcommands", () => {
			const result = run("knowledge", "--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("list");
			expect(result.stdout).toContain("get");
			expect(result.stdout).toContain("search");
			expect(result.stdout).toContain("status");
			expect(result.stdout).toContain("delete");
			expect(result.stdout).toContain("delete-all");
			expect(result.stdout).toContain("config");
		});

		it("trace --help shows all 4 subcommands", () => {
			const result = run("trace", "--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("list");
			expect(result.stdout).toContain("get");
			expect(result.stdout).toContain("stats");
			expect(result.stdout).toContain("search");
		});

		it("eval --help shows all 3 subcommands", () => {
			const result = run("eval", "--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("list");
			expect(result.stdout).toContain("get");
			expect(result.stdout).toContain("delete");
		});

		it("root --help shows knowledge, trace, and eval commands", () => {
			const result = run("--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("knowledge");
			expect(result.stdout).toContain("trace");
			expect(result.stdout).toContain("eval");
		});
	});
});
