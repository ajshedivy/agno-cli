import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse, parseDocument } from "yaml";
import { ConfigError } from "./errors.js";

// ── Constants ────────────────────────────────────────────────────────

export const AGNO_CONFIG_DIR = join(homedir(), ".agno");
export const AGNO_CONFIG_FILE = join(AGNO_CONFIG_DIR, "config.yaml");

// ── Internal mutable path (overridable for testing) ──────────────────

let _configFile = AGNO_CONFIG_FILE;

/**
 * Override the config file path. Exported for testing only.
 * Pass undefined to reset to the default path.
 */
export function setConfigPath(path: string | undefined): void {
	_configFile = path ?? AGNO_CONFIG_FILE;
}

/**
 * Get the current config file path (follows setConfigPath overrides).
 */
export function getConfigPath(): string {
	return _configFile;
}

// ── Types ────────────────────────────────────────────────────────────

export interface ContextConfig {
	baseUrl: string;
	securityKey?: string;
	timeout: number;
}

export interface AgnoConfig {
	current_context: string;
	contexts: Record<string, ContextConfig>;
}

export interface ResolveContextOptions {
	contextName?: string;
	urlOverride?: string;
	keyOverride?: string;
	timeoutOverride?: number;
}

// Keep ResolvedContext as an alias for backward compat with client.ts
export type ResolvedContext = ContextConfig;

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AgnoConfig = {
	current_context: "default",
	contexts: {
		default: {
			baseUrl: "http://localhost:7777",
			timeout: 60,
			securityKey: undefined,
		},
	},
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Map a single raw YAML context (snake_case) to a ContextConfig (camelCase).
 * Converts null security_key to undefined to prevent "Bearer null" headers.
 */
function mapContext(raw: Record<string, unknown>): ContextConfig {
	return {
		baseUrl: String(raw.base_url ?? "http://localhost:7777"),
		timeout: Number(raw.timeout ?? 60),
		securityKey: raw.security_key == null ? undefined : String(raw.security_key),
	};
}

/**
 * Map a ContextConfig (camelCase) back to snake_case for YAML serialization.
 */
function unmapContext(ctx: ContextConfig): Record<string, unknown> {
	return {
		base_url: ctx.baseUrl,
		timeout: ctx.timeout,
		security_key: ctx.securityKey ?? null,
	};
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Check whether the config file exists on disk.
 */
export function configExists(): boolean {
	return existsSync(_configFile);
}

/**
 * Load config from the config file path (default: ~/.agno/config.yaml).
 * Returns a deep copy of DEFAULT_CONFIG when the file does not exist.
 * Maps YAML snake_case keys to TypeScript camelCase.
 * Converts null security_key values to undefined (Pitfall 4).
 */
export function loadConfig(): AgnoConfig {
	if (!existsSync(_configFile)) {
		return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AgnoConfig;
	}

	try {
		const raw = readFileSync(_configFile, "utf-8");
		const data = parse(raw) as Record<string, unknown> | null;
		if (!data) {
			return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AgnoConfig;
		}

		const rawContexts = (data.contexts ?? {}) as Record<string, Record<string, unknown>>;
		const contexts: Record<string, ContextConfig> = {};
		for (const [name, rawCtx] of Object.entries(rawContexts)) {
			contexts[name] = mapContext(rawCtx);
		}

		return {
			current_context: String(data.current_context ?? "default"),
			contexts,
		};
	} catch (err) {
		throw new ConfigError(
			`Failed to parse config at ${_configFile}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Save config to the config file path (default: ~/.agno/config.yaml).
 * Creates the config directory with 0o700 and writes the file with 0o600.
 * Uses parseDocument for comment-preserving round-trips when an existing file is present.
 */
export function saveConfig(config: AgnoConfig): void {
	const configDir = dirname(_configFile);
	mkdirSync(configDir, { recursive: true, mode: 0o700 });

	if (existsSync(_configFile)) {
		// Comment-preserving round-trip: parse existing doc, update in place
		const raw = readFileSync(_configFile, "utf-8");
		const doc = parseDocument(raw);

		doc.set("current_context", config.current_context);

		// Update each context in the YAML AST
		for (const [name, ctx] of Object.entries(config.contexts)) {
			const snake = unmapContext(ctx);
			doc.setIn(["contexts", name, "base_url"], snake.base_url);
			doc.setIn(["contexts", name, "timeout"], snake.timeout);
			doc.setIn(["contexts", name, "security_key"], snake.security_key);
		}

		// Remove contexts that were deleted
		const existingContexts = doc.getIn(["contexts"]) as unknown;
		if (existingContexts && typeof existingContexts === "object" && "items" in existingContexts) {
			const yamlMap = existingContexts as { items: Array<{ key: { value: string } }> };
			const toDelete: string[] = [];
			for (const item of yamlMap.items) {
				if (item.key?.value && !(item.key.value in config.contexts)) {
					toDelete.push(item.key.value);
				}
			}
			for (const name of toDelete) {
				doc.deleteIn(["contexts", name]);
			}
		}

		writeFileSync(_configFile, doc.toString(), { mode: 0o600 });
	} else {
		// No existing file -- create fresh document from config data
		const data = {
			current_context: config.current_context,
			contexts: Object.fromEntries(Object.entries(config.contexts).map(([name, ctx]) => [name, unmapContext(ctx)])),
		};
		const doc = parseDocument(JSON.stringify(data));
		writeFileSync(_configFile, doc.toString(), { mode: 0o600 });
	}
}

/**
 * Resolve the active context with the full precedence chain:
 *   CLI flags > env vars > active context > defaults
 *
 * Context name resolution: overrides.contextName > AGNO_CONTEXT env var > config.current_context
 */
export function resolveContext(overrides: ResolveContextOptions): ContextConfig {
	const config = loadConfig();

	// Determine which context to use
	const name = overrides.contextName ?? process.env.AGNO_CONTEXT ?? config.current_context;
	const ctx = config.contexts[name];
	if (!ctx) {
		throw new ConfigError(`Context '${name}' not found. Run 'agno-os config list' to see available contexts.`);
	}

	// Layer overrides: CLI flags > env vars > context values
	return {
		baseUrl: overrides.urlOverride ?? process.env.AGNO_BASE_URL ?? ctx.baseUrl,
		securityKey: overrides.keyOverride ?? process.env.AGNO_SECURITY_KEY ?? ctx.securityKey,
		timeout:
			overrides.timeoutOverride ??
			(process.env.AGNO_TIMEOUT ? Number.parseFloat(process.env.AGNO_TIMEOUT) : undefined) ??
			ctx.timeout,
	};
}
