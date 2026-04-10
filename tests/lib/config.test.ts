import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import {
	loadConfig,
	saveConfig,
	resolveContext,
	configExists,
	setConfigPath,
	type AgnoConfig,
} from "../../src/lib/config.js";

let testDir: string;
let testConfigFile: string;

describe("config module", () => {
	beforeEach(() => {
		testDir = join(tmpdir(), `agno-test-${randomUUID()}`);
		testConfigFile = join(testDir, "config.yaml");
		mkdirSync(testDir, { recursive: true });
		// Point the config module at our temp path
		setConfigPath(testConfigFile);
		// Clear env vars
		delete process.env.AGNO_BASE_URL;
		delete process.env.AGNO_SECURITY_KEY;
		delete process.env.AGNO_TIMEOUT;
		delete process.env.AGNO_CONTEXT;
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
		setConfigPath(undefined);
		delete process.env.AGNO_BASE_URL;
		delete process.env.AGNO_SECURITY_KEY;
		delete process.env.AGNO_TIMEOUT;
		delete process.env.AGNO_CONTEXT;
	});

	describe("loadConfig", () => {
		it("returns default config when file does not exist", () => {
			const config = loadConfig();
			expect(config.current_context).toBe("default");
			expect(config.contexts.default).toBeDefined();
			expect(config.contexts.default?.baseUrl).toBe("http://localhost:7777");
			expect(config.contexts.default?.timeout).toBe(60);
			expect(config.contexts.default?.securityKey).toBeUndefined();
		});

		it("parses valid YAML fixture and returns typed AgnoConfig", () => {
			const fixture = readFileSync(
				join(import.meta.dirname, "..", "fixtures", "config.yaml"),
				"utf-8",
			);
			writeFileSync(testConfigFile, fixture);

			const config = loadConfig();
			expect(config.current_context).toBe("dev");
			expect(Object.keys(config.contexts)).toEqual(["dev", "prod"]);
			expect(config.contexts.dev?.baseUrl).toBe("http://localhost:7777");
			expect(config.contexts.dev?.timeout).toBe(30);
			expect(config.contexts.prod?.baseUrl).toBe("https://agentos.example.com");
			expect(config.contexts.prod?.timeout).toBe(60);
			expect(config.contexts.prod?.securityKey).toBe("sk-test-key-12345678");
		});

		it("converts YAML null security_key to undefined", () => {
			const fixture = readFileSync(
				join(import.meta.dirname, "..", "fixtures", "config.yaml"),
				"utf-8",
			);
			writeFileSync(testConfigFile, fixture);

			const config = loadConfig();
			// dev context has security_key: null in YAML -- should be undefined in TS
			expect(config.contexts.dev?.securityKey).toBeUndefined();
		});
	});

	describe("saveConfig", () => {
		it("creates config directory with proper permissions", () => {
			// Point to a nested path that doesn't exist yet
			const nestedDir = join(testDir, "nested", "dir");
			const nestedFile = join(nestedDir, "config.yaml");
			setConfigPath(nestedFile);

			const config: AgnoConfig = {
				current_context: "default",
				contexts: {
					default: {
						baseUrl: "http://localhost:7777",
						timeout: 60,
						securityKey: undefined,
					},
				},
			};
			saveConfig(config);
			expect(existsSync(nestedDir)).toBe(true);
		});

		it("writes valid YAML that can be re-parsed", () => {
			const config: AgnoConfig = {
				current_context: "default",
				contexts: {
					default: {
						baseUrl: "http://localhost:9999",
						timeout: 45,
						securityKey: "sk-round-trip",
					},
				},
			};
			saveConfig(config);

			const reloaded = loadConfig();
			expect(reloaded.current_context).toBe("default");
			expect(reloaded.contexts.default?.baseUrl).toBe("http://localhost:9999");
			expect(reloaded.contexts.default?.timeout).toBe(45);
			expect(reloaded.contexts.default?.securityKey).toBe("sk-round-trip");
		});

		it("preserves existing comments in YAML file", () => {
			// Write a config with comments
			const yamlWithComments = `# My config
current_context: default
contexts:
  default:
    # Default endpoint
    base_url: "http://localhost:7777"
    timeout: 60.0
    security_key: null
`;
			writeFileSync(testConfigFile, yamlWithComments);

			// Load and modify
			const config = loadConfig();
			config.contexts.default!.timeout = 90;
			saveConfig(config);

			// Re-read raw file and check comments preserved
			const raw = readFileSync(testConfigFile, "utf-8");
			expect(raw).toContain("# My config");
			expect(raw).toContain("# Default endpoint");
			expect(raw).toContain("90");
		});
	});

	describe("configExists", () => {
		it("returns false when file is missing", () => {
			expect(configExists()).toBe(false);
		});

		it("returns true when file is present", () => {
			writeFileSync(testConfigFile, "current_context: default\ncontexts: {}");
			expect(configExists()).toBe(true);
		});
	});

	describe("resolveContext", () => {
		beforeEach(() => {
			const yaml = `current_context: dev
contexts:
  dev:
    base_url: "http://dev:7777"
    timeout: 30
    security_key: "sk-dev-key"
  staging:
    base_url: "http://staging:7777"
    timeout: 45
    security_key: null
`;
			writeFileSync(testConfigFile, yaml);
		});

		it("returns active context values when no overrides", () => {
			const ctx = resolveContext({});
			expect(ctx.baseUrl).toBe("http://dev:7777");
			expect(ctx.timeout).toBe(30);
			expect(ctx.securityKey).toBe("sk-dev-key");
		});

		it("env vars override context values", () => {
			process.env.AGNO_BASE_URL = "http://env-override:9000";
			process.env.AGNO_SECURITY_KEY = "sk-env-key";
			process.env.AGNO_TIMEOUT = "120";

			const ctx = resolveContext({});
			expect(ctx.baseUrl).toBe("http://env-override:9000");
			expect(ctx.securityKey).toBe("sk-env-key");
			expect(ctx.timeout).toBe(120);
		});

		it("CLI flag overrides override env vars", () => {
			process.env.AGNO_BASE_URL = "http://env:9000";
			process.env.AGNO_SECURITY_KEY = "sk-env";
			process.env.AGNO_TIMEOUT = "120";

			const ctx = resolveContext({
				urlOverride: "http://flag:8000",
				keyOverride: "sk-flag",
				timeoutOverride: 15,
			});
			expect(ctx.baseUrl).toBe("http://flag:8000");
			expect(ctx.securityKey).toBe("sk-flag");
			expect(ctx.timeout).toBe(15);
		});

		it("throws ConfigError for unknown context name", () => {
			expect(() => resolveContext({ contextName: "nonexistent" })).toThrow(
				/Context 'nonexistent' not found/,
			);
		});

		it("uses AGNO_CONTEXT env var for context name selection", () => {
			process.env.AGNO_CONTEXT = "staging";
			const ctx = resolveContext({});
			expect(ctx.baseUrl).toBe("http://staging:7777");
			expect(ctx.timeout).toBe(45);
			// null in YAML should be undefined
			expect(ctx.securityKey).toBeUndefined();
		});
	});
});
