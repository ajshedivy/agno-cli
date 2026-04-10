import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { parse } from "yaml";

import { setConfigPath, loadConfig } from "../../src/lib/config.js";
import { configCommand } from "../../src/commands/config.js";

let testDir: string;
let testConfigFile: string;
let stdoutData: string;
let stderrData: string;
let originalStdoutWrite: typeof process.stdout.write;
let originalStderrWrite: typeof process.stderr.write;
let originalExitCode: number | undefined;

/**
 * Create a fresh program with the config command attached and global options.
 * Commander requires a fresh instance per parseAsync call.
 */
function createProgram(): Command {
	const program = new Command("agno-os");
	program.option("-o, --output <format>", "Output format", "table");
	program.addCommand(configCommand);
	// Prevent Commander from calling process.exit on errors
	program.exitOverride();
	return program;
}

/**
 * Parse a command string into argv array for Commander.
 */
function argv(cmd: string): string[] {
	return ["node", "agno-os", ...cmd.split(" ").filter(Boolean)];
}

describe("config command", () => {
	beforeEach(() => {
		testDir = join(tmpdir(), `agno-cmd-test-${randomUUID()}`);
		testConfigFile = join(testDir, "config.yaml");
		mkdirSync(testDir, { recursive: true });
		setConfigPath(testConfigFile);

		// Capture stdout and stderr
		stdoutData = "";
		stderrData = "";
		originalStdoutWrite = process.stdout.write;
		originalStderrWrite = process.stderr.write;
		originalExitCode = process.exitCode;
		process.stdout.write = ((chunk: string | Uint8Array) => {
			stdoutData += String(chunk);
			return true;
		}) as typeof process.stdout.write;
		process.stderr.write = ((chunk: string | Uint8Array) => {
			stderrData += String(chunk);
			return true;
		}) as typeof process.stderr.write;
		process.exitCode = undefined;
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
		setConfigPath(undefined);
		process.stdout.write = originalStdoutWrite;
		process.stderr.write = originalStderrWrite;
		process.exitCode = originalExitCode;
	});

	describe("config init", () => {
		it("creates config file with default context", async () => {
			const program = createProgram();
			await program.parseAsync(argv("config init"));

			expect(existsSync(testConfigFile)).toBe(true);
			const config = loadConfig();
			expect(config.current_context).toBe("default");
			expect(config.contexts.default?.baseUrl).toBe("http://localhost:7777");
			expect(config.contexts.default?.timeout).toBe(60);
			expect(stderrData).toContain("Config initialized");
		});

		it("creates config with custom values via --url and --key", async () => {
			const program = createProgram();
			await program.parseAsync(
				argv("config init --url http://custom:8000 --key sk-test --timeout 30"),
			);

			const config = loadConfig();
			expect(config.contexts.default?.baseUrl).toBe("http://custom:8000");
			expect(config.contexts.default?.securityKey).toBe("sk-test");
			expect(config.contexts.default?.timeout).toBe(30);
		});

		it("refuses to overwrite existing config", async () => {
			// Create an existing config
			writeFileSync(testConfigFile, "current_context: default\ncontexts:\n  default:\n    base_url: http://old:7777\n    timeout: 60\n    security_key: null\n");

			const program = createProgram();
			await program.parseAsync(argv("config init"));

			expect(process.exitCode).toBe(1);
			expect(stderrData).toContain("Config already exists");
		});

		it("overwrites existing config with --force", async () => {
			writeFileSync(testConfigFile, "current_context: default\ncontexts:\n  default:\n    base_url: http://old:7777\n    timeout: 60\n    security_key: null\n");

			const program = createProgram();
			await program.parseAsync(argv("config init --force --url http://new:9000"));

			const config = loadConfig();
			expect(config.contexts.default?.baseUrl).toBe("http://new:9000");
			expect(stderrData).toContain("Config initialized");
		});
	});

	describe("config add", () => {
		beforeEach(() => {
			writeFileSync(testConfigFile, "current_context: default\ncontexts:\n  default:\n    base_url: http://localhost:7777\n    timeout: 60\n    security_key: null\n");
		});

		it("adds a new context", async () => {
			const program = createProgram();
			await program.parseAsync(argv("config add dev --url http://dev:7777"));

			const config = loadConfig();
			expect(config.contexts.dev).toBeDefined();
			expect(config.contexts.dev?.baseUrl).toBe("http://dev:7777");
			expect(stderrData).toContain("added");
		});

		it("fails when context already exists", async () => {
			const program = createProgram();
			await program.parseAsync(argv("config add default --url http://dup:7777"));

			expect(process.exitCode).toBe(1);
			expect(stderrData).toContain("already exists");
		});
	});

	describe("config use", () => {
		beforeEach(() => {
			writeFileSync(testConfigFile, "current_context: default\ncontexts:\n  default:\n    base_url: http://localhost:7777\n    timeout: 60\n    security_key: null\n  dev:\n    base_url: http://dev:7777\n    timeout: 30\n    security_key: null\n");
		});

		it("switches active context", async () => {
			const program = createProgram();
			await program.parseAsync(argv("config use dev"));

			const config = loadConfig();
			expect(config.current_context).toBe("dev");
			expect(stderrData).toContain("Switched to context");
		});

		it("fails for nonexistent context", async () => {
			const program = createProgram();
			await program.parseAsync(argv("config use nonexistent"));

			expect(process.exitCode).toBe(1);
			expect(stderrData).toContain("not found");
		});
	});

	describe("config list", () => {
		beforeEach(() => {
			writeFileSync(testConfigFile, "current_context: default\ncontexts:\n  default:\n    base_url: http://localhost:7777\n    timeout: 60\n    security_key: null\n  prod:\n    base_url: https://prod.example.com\n    timeout: 30\n    security_key: sk-prod\n");
		});

		it("shows all contexts with active marker", async () => {
			const program = createProgram();
			await program.parseAsync(argv("config list"));

			// Table output should include both context names
			expect(stdoutData).toContain("default");
			expect(stdoutData).toContain("prod");
			// Active marker
			expect(stdoutData).toContain("*");
		});
	});

	describe("config show", () => {
		beforeEach(() => {
			writeFileSync(testConfigFile, "current_context: default\ncontexts:\n  default:\n    base_url: http://localhost:7777\n    timeout: 60\n    security_key: sk-show-test-abcdefgh\n");
		});

		it("displays active context details with masked key", async () => {
			const program = createProgram();
			await program.parseAsync(argv("config show"));

			expect(stdoutData).toContain("default");
			expect(stdoutData).toContain("http://localhost:7777");
			// Key should be masked, not shown in full
			expect(stdoutData).not.toContain("sk-show-test-abcdefgh");
			expect(stdoutData).toContain("sk-...efgh");
		});
	});

	describe("config set", () => {
		beforeEach(() => {
			writeFileSync(testConfigFile, "current_context: default\ncontexts:\n  default:\n    base_url: http://localhost:7777\n    timeout: 60\n    security_key: null\n");
		});

		it("updates a field in active context", async () => {
			const program = createProgram();
			await program.parseAsync(argv("config set base_url http://new:8000"));

			const config = loadConfig();
			expect(config.contexts.default?.baseUrl).toBe("http://new:8000");
			expect(stderrData).toContain("Set base_url");
		});
	});

	describe("config remove", () => {
		beforeEach(() => {
			writeFileSync(testConfigFile, "current_context: default\ncontexts:\n  default:\n    base_url: http://localhost:7777\n    timeout: 60\n    security_key: null\n  dev:\n    base_url: http://dev:7777\n    timeout: 30\n    security_key: null\n");
		});

		it("deletes a named context", async () => {
			const program = createProgram();
			await program.parseAsync(argv("config remove dev"));

			const config = loadConfig();
			expect(config.contexts.dev).toBeUndefined();
			expect(stderrData).toContain("removed");
		});

		it("refuses to delete the active context", async () => {
			const program = createProgram();
			await program.parseAsync(argv("config remove default"));

			expect(process.exitCode).toBe(1);
			expect(stderrData).toContain("Cannot remove active context");
		});
	});
});
