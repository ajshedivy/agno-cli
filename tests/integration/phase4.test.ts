import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
			timeout: 30000,
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
function runJson(...args: string[]): { result: CliResult; parsed: unknown } {
	const result = run("--output", "json", ...args);
	let parsed: unknown = null;
	try {
		parsed = JSON.parse(result.stdout);
	} catch {
		// JSON parse failed -- leave as null
	}
	return { result, parsed };
}

/**
 * Run the CLI without --url (for testing client-side validation only).
 */
function runLocal(...args: string[]): CliResult {
	try {
		const stdout = execFileSync("npx", ["tsx", "src/bin/agno-os.ts", ...args], {
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
 * Check if the live server is reachable.
 */
function isServerAvailable(): boolean {
	try {
		execFileSync("npx", ["tsx", "src/bin/agno-os.ts", "--url", SERVER_URL, "status", "--output", "json"], {
			cwd: PROJECT_ROOT,
			encoding: "utf-8",
			timeout: 10000,
		});
		return true;
	} catch {
		return false;
	}
}

let serverAvailable = false;

beforeAll(() => {
	serverAvailable = isServerAvailable();
	if (!serverAvailable) {
		console.warn("AgentOS server not available at localhost:8000 -- skipping live tests");
	}
});

describe("Phase 4: Integration tests (requires AgentOS at localhost:8000)", () => {
	// -- Knowledge upload -------------------------------------------------------

	describe("knowledge upload", () => {
		let tempDir: string;

		beforeAll(() => {
			tempDir = mkdtempSync(join(tmpdir(), "agno-cli-upload-"));
		});

		afterAll(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it.skipIf(!serverAvailable)("uploads a local file successfully", () => {
			const testFile = join(tempDir, "test-upload.txt");
			writeFileSync(testFile, "This is test content for knowledge upload integration test.");

			const result = run("knowledge", "upload", testFile, "--name", "test-upload-integration");
			expect(result.exitCode).toBe(0);
			// The upload command writes "Check status:" to stderr
			expect(result.stdout + result.stderr).toContain("Check status:");
		});

		it("rejects upload with no arguments", () => {
			// Use runLocal to avoid --url being captured by knowledge upload's --url option
			const result = runLocal("knowledge", "upload");
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Provide a file path or --url");
		});

		it("rejects upload of nonexistent file", () => {
			// Use runLocal to avoid --url being captured by knowledge upload's --url option
			const result = runLocal("knowledge", "upload", "/nonexistent/file-that-does-not-exist.txt");
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("File not found");
		});
	});

	// -- Approval list ----------------------------------------------------------

	describe("approval list", () => {
		it.skipIf(!serverAvailable)("returns valid JSON with data array", () => {
			const { result, parsed } = runJson("approval", "list");
			expect(result.exitCode).toBe(0);
			expect(parsed).not.toBeNull();
			const p = parsed as Record<string, unknown>;
			expect(p).toHaveProperty("data");
			expect(Array.isArray(p.data)).toBe(true);
		});
	});

	// -- Auth me ----------------------------------------------------------------

	describe("auth me", () => {
		it.skipIf(!serverAvailable)("returns valid JSON", () => {
			const { result, parsed } = runJson("auth", "me");
			expect(result.exitCode).toBe(0);
			expect(parsed).not.toBeNull();
		});
	});

	// -- Auth key lifecycle -----------------------------------------------------

	describe("auth key", () => {
		it.skipIf(!serverAvailable)("lists keys as valid JSON", () => {
			const result = run("--output", "json", "auth", "key", "list");
			expect(result.exitCode).toBe(0);
			const parsed = JSON.parse(result.stdout);
			expect(parsed).toBeDefined();
		});

		it.skipIf(!serverAvailable)("creates a new API key", () => {
			const result = run("--output", "json", "auth", "key", "create", "--name", "test-key-integration");
			expect(result.exitCode).toBe(0);
			const parsed = JSON.parse(result.stdout);
			// The create response should include the key value
			expect(parsed).toHaveProperty("key");
		});
	});

	// -- Component list ---------------------------------------------------------

	describe("component list", () => {
		it.skipIf(!serverAvailable)("returns valid JSON with data array", () => {
			const { result, parsed } = runJson("component", "list");
			expect(result.exitCode).toBe(0);
			expect(parsed).not.toBeNull();
			const p = parsed as Record<string, unknown>;
			expect(p).toHaveProperty("data");
			expect(Array.isArray(p.data)).toBe(true);
		});
	});

	// -- Schedule list ----------------------------------------------------------

	describe("schedule list", () => {
		it.skipIf(!serverAvailable)("returns valid JSON with data array", () => {
			const { result, parsed } = runJson("schedule", "list");
			expect(result.exitCode).toBe(0);
			expect(parsed).not.toBeNull();
			const p = parsed as Record<string, unknown>;
			expect(p).toHaveProperty("data");
			expect(Array.isArray(p.data)).toBe(true);
		});
	});

	// -- Registry list ----------------------------------------------------------

	describe("registry list", () => {
		it.skipIf(!serverAvailable)("returns valid JSON", () => {
			const result = run("--output", "json", "registry", "list");
			expect(result.exitCode).toBe(0);
			const parsed = JSON.parse(result.stdout);
			expect(parsed).toBeDefined();
		});
	});

	// -- Database migrate -------------------------------------------------------

	describe("database migrate", () => {
		it.skipIf(!serverAvailable)("executes without crashing (may 404 if no db)", () => {
			const result = run("database", "migrate", "test-db");
			// Either succeeds or returns a server error (validates command wiring)
			expect([0, 1]).toContain(result.exitCode);
		});
	});

	// -- --json field selection --------------------------------------------------

	describe("--json field selection", () => {
		it.skipIf(!serverAvailable)("filters to selected fields only", () => {
			const result = run("agent", "list", "--json", "id,name");
			expect(result.exitCode).toBe(0);
			const parsed = JSON.parse(result.stdout) as Record<string, unknown>[];
			expect(Array.isArray(parsed)).toBe(true);
			if (parsed.length > 0) {
				const keys = Object.keys(parsed[0]);
				expect(keys).toContain("id");
				expect(keys).toContain("name");
				// Should NOT contain other fields like description, model, etc.
				expect(keys.length).toBeLessThanOrEqual(2);
			}
		});

		it.skipIf(!serverAvailable)("returns full JSON with --json (no fields)", () => {
			const result = run("agent", "list", "--json");
			expect(result.exitCode).toBe(0);
			const parsed = JSON.parse(result.stdout);
			// --json without fields wraps in envelope (same as --output json)
			expect(parsed).toHaveProperty("data");
			expect(Array.isArray(parsed.data)).toBe(true);
		});

		it.skipIf(!serverAvailable)("--json implies JSON output (not table)", () => {
			const result = run("agent", "list", "--json", "id");
			expect(result.exitCode).toBe(0);
			// Output should be valid JSON, not a table
			const parsed = JSON.parse(result.stdout);
			expect(parsed).toBeDefined();
			expect(Array.isArray(parsed)).toBe(true);
		});
	});

	// -- Help output for new commands -------------------------------------------

	describe("help output includes Phase 4 commands", () => {
		it("shows all Phase 4 commands in top-level help", () => {
			const result = run("--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("approval");
			expect(result.stdout).toContain("auth");
			expect(result.stdout).toContain("component");
			expect(result.stdout).toContain("schedule");
			expect(result.stdout).toContain("database");
			expect(result.stdout).toContain("registry");
		});

		it("shows --json option in global help", () => {
			const result = run("--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("--json");
		});

		it("shows approval subcommands", () => {
			const result = run("approval", "--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("list");
			expect(result.stdout).toContain("get");
			expect(result.stdout).toContain("resolve");
		});

		it("shows auth subcommands including nested key and connection", () => {
			const result = run("auth", "--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("me");
			expect(result.stdout).toContain("key");
			expect(result.stdout).toContain("connection");
		});

		it("shows schedule subcommands", () => {
			const result = run("schedule", "--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("list");
			expect(result.stdout).toContain("create");
			expect(result.stdout).toContain("pause");
			expect(result.stdout).toContain("resume");
			expect(result.stdout).toContain("runs");
		});

		it("shows component subcommands including config", () => {
			const result = run("component", "--help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("list");
			expect(result.stdout).toContain("get");
			expect(result.stdout).toContain("create");
			expect(result.stdout).toContain("config");
		});
	});
});
