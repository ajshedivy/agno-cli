import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..");

interface CliResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/**
 * Run the CLI as a subprocess via tsx (dev mode).
 * Uses HOME override to isolate config from the real ~/.agno/config.yaml.
 */
function runCli(args: string[], env?: Record<string, string>): CliResult {
	try {
		const stdout = execFileSync("npx", ["tsx", "src/bin/agno-os.ts", ...args], {
			cwd: PROJECT_ROOT,
			encoding: "utf-8",
			env: { ...process.env, ...env },
			timeout: 15000,
		});
		return { stdout, stderr: "", exitCode: 0 };
	} catch (err: unknown) {
		const e = err as {
			stdout?: string;
			stderr?: string;
			status?: number;
		};
		return {
			stdout: e.stdout ?? "",
			stderr: e.stderr ?? "",
			exitCode: e.status ?? 1,
		};
	}
}

/**
 * Run the built CLI binary via node (production mode).
 */
function runBuiltCli(args: string[], env?: Record<string, string>): CliResult {
	try {
		const stdout = execFileSync("node", [join(PROJECT_ROOT, "dist/bin/agno-os.js"), ...args], {
			cwd: PROJECT_ROOT,
			encoding: "utf-8",
			env: { ...process.env, ...env },
			timeout: 15000,
		});
		return { stdout, stderr: "", exitCode: 0 };
	} catch (err: unknown) {
		const e = err as {
			stdout?: string;
			stderr?: string;
			status?: number;
		};
		return {
			stdout: e.stdout ?? "",
			stderr: e.stderr ?? "",
			exitCode: e.status ?? 1,
		};
	}
}

describe("CLI integration tests", () => {
	let tempHome: string;

	beforeEach(() => {
		tempHome = mkdtempSync(join(tmpdir(), "agno-cli-test-"));
	});

	afterEach(() => {
		rmSync(tempHome, { recursive: true, force: true });
	});

	describe("version", () => {
		it("outputs 'dev' in tsx mode", () => {
			const result = runCli(["--version"], { HOME: tempHome });
			expect(result.stdout.trim()).toBe("dev");
			expect(result.exitCode).toBe(0);
		});

		it("outputs '0.1.0' from built binary", () => {
			const result = runBuiltCli(["--version"], { HOME: tempHome });
			expect(result.stdout.trim()).toBe("0.1.0");
			expect(result.exitCode).toBe(0);
		});
	});

	describe("help", () => {
		it("shows top-level help with 'config' command listed", () => {
			const result = runCli(["--help"], { HOME: tempHome });
			expect(result.stdout).toContain("agno-os");
			expect(result.stdout).toContain("config");
			expect(result.stdout).toContain("Options:");
			expect(result.exitCode).toBe(0);
		});

		it("shows help with examples section", () => {
			const result = runCli(["--help"], { HOME: tempHome });
			expect(result.stdout).toContain("Examples:");
			expect(result.stdout).toContain("agno-os config init");
		});

		it("shows global options in help", () => {
			const result = runCli(["--help"], { HOME: tempHome });
			expect(result.stdout).toContain("--context");
			expect(result.stdout).toContain("--output");
			expect(result.stdout).toContain("--url");
			expect(result.stdout).toContain("--key");
			expect(result.stdout).toContain("--timeout");
			expect(result.stdout).toContain("--no-color");
			expect(result.stdout).toContain("--verbose");
		});
	});

	describe("config --help", () => {
		it("shows all config subcommands", () => {
			const result = runCli(["config", "--help"], { HOME: tempHome });
			expect(result.stdout).toContain("init");
			expect(result.stdout).toContain("add");
			expect(result.stdout).toContain("use");
			expect(result.stdout).toContain("list");
			expect(result.stdout).toContain("show");
			expect(result.stdout).toContain("set");
			expect(result.stdout).toContain("remove");
			expect(result.exitCode).toBe(0);
		});
	});

	describe("config init", () => {
		it("creates config file with default values", () => {
			const result = runCli(["config", "init"], { HOME: tempHome });
			expect(result.exitCode).toBe(0);

			const configPath = join(tempHome, ".agno", "config.yaml");
			expect(existsSync(configPath)).toBe(true);

			const content = readFileSync(configPath, "utf-8");
			expect(content).toContain("current_context");
			expect(content).toContain("default");
			expect(content).toContain("base_url");
		});

		it("creates config with custom URL", () => {
			const result = runCli(["config", "init", "--url", "http://test:8000"], { HOME: tempHome });
			expect(result.exitCode).toBe(0);

			const configPath = join(tempHome, ".agno", "config.yaml");
			const content = readFileSync(configPath, "utf-8");
			expect(content).toContain("http://test:8000");
		});

		it("succeeds with --force when config already exists", () => {
			// First init
			runCli(["config", "init"], { HOME: tempHome });
			// Second init with --force
			const result = runCli(["config", "init", "--force", "--url", "http://new:9000"], { HOME: tempHome });
			expect(result.exitCode).toBe(0);

			const configPath = join(tempHome, ".agno", "config.yaml");
			const content = readFileSync(configPath, "utf-8");
			expect(content).toContain("http://new:9000");
		});

		it("fails without --force when config exists", () => {
			runCli(["config", "init"], { HOME: tempHome });
			const result = runCli(["config", "init"], { HOME: tempHome });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("already exists");
		});
	});

	describe("config lifecycle", () => {
		it("supports full add -> use -> show -> list -> set -> remove workflow", () => {
			// Step 1: init
			const init = runCli(["config", "init"], { HOME: tempHome });
			expect(init.exitCode).toBe(0);

			// Step 2: add dev context
			const add = runCli(["config", "add", "dev", "--url", "http://dev:7777"], { HOME: tempHome });
			expect(add.exitCode).toBe(0);

			// Step 3: use dev
			const use = runCli(["config", "use", "dev"], { HOME: tempHome });
			expect(use.exitCode).toBe(0);

			// Step 4: show (should show dev context)
			const show = runCli(["config", "show"], { HOME: tempHome });
			expect(show.exitCode).toBe(0);
			expect(show.stdout).toContain("dev");
			expect(show.stdout).toContain("http://dev:7777");

			// Step 5: list (should show * dev)
			const list = runCli(["config", "list"], { HOME: tempHome });
			expect(list.exitCode).toBe(0);
			expect(list.stdout).toContain("dev");
			expect(list.stdout).toContain("default");

			// Step 6: set base_url on active (dev) context
			const set = runCli(["config", "set", "base_url", "http://updated:7777"], { HOME: tempHome });
			expect(set.exitCode).toBe(0);

			// Step 7: show again (should reflect updated URL)
			const showUpdated = runCli(["config", "show"], { HOME: tempHome });
			expect(showUpdated.stdout).toContain("http://updated:7777");

			// Step 8: use default, then remove dev
			runCli(["config", "use", "default"], { HOME: tempHome });
			const remove = runCli(["config", "remove", "dev"], { HOME: tempHome });
			expect(remove.exitCode).toBe(0);

			// Step 9: list -- dev should be gone
			const listFinal = runCli(["config", "list"], { HOME: tempHome });
			expect(listFinal.stdout).not.toContain("dev");
		});
	});

	describe("config remove active fails", () => {
		it("refuses to remove the active context", () => {
			runCli(["config", "init"], { HOME: tempHome });
			const result = runCli(["config", "remove", "default"], { HOME: tempHome });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Cannot remove active context");
		});
	});

	describe("JSON output", () => {
		it("produces valid JSON from config list --output json", () => {
			runCli(["config", "init"], { HOME: tempHome });
			const result = runCli(["config", "list", "--output", "json"], { HOME: tempHome });
			expect(result.exitCode).toBe(0);

			const parsed = JSON.parse(result.stdout);
			expect(parsed).toHaveProperty("data");
			expect(Array.isArray(parsed.data)).toBe(true);
			expect(parsed.data[0]).toHaveProperty("name", "default");
		});
	});

	describe("unknown command", () => {
		it("exits non-zero for unknown commands", () => {
			const result = runCli(["nonexistent"], { HOME: tempHome });
			expect(result.exitCode).not.toBe(0);
		});
	});

	describe("EPIPE handling", () => {
		it("entry point source contains EPIPE handler as first statement", () => {
			const source = readFileSync(join(PROJECT_ROOT, "src/bin/agno-os.ts"), "utf-8");
			const lines = source.split("\n");
			// Find first non-comment, non-empty line
			const firstExecutable = lines.find((l) => l.trim() && !l.trim().startsWith("//"));
			expect(firstExecutable).toContain("process.stdout.on");

			// Verify both stdout and stderr handlers exist
			expect(source).toContain('process.stdout.on("error"');
			expect(source).toContain('process.stderr.on("error"');
			expect(source).toContain('"EPIPE"');
			expect(source).toContain("process.exit(0)");
		});
	});
});
