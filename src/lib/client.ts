import { AgentOSClient } from "@worksofadam/agentos-sdk";
import type { Command } from "commander";
import { resolveContext } from "./config.js";

/**
 * Module-level client cache. Reused across commands within a single CLI invocation.
 */
let _client: AgentOSClient | null = null;

/**
 * Get or create a lazily-initialized SDK client from resolved config.
 *
 * Reads global options from the Commander command chain:
 * - --context: named config context
 * - --url: base URL override
 * - --key: API key override
 * - --timeout: request timeout override (seconds)
 *
 * Config stores timeout in seconds; SDK expects milliseconds.
 */
export function getClient(cmd: Command): AgentOSClient {
	if (_client) return _client;

	const globals = cmd.optsWithGlobals();
	const ctx = resolveContext({
		contextName: globals.context as string | undefined,
		urlOverride: globals.url as string | undefined,
		keyOverride: globals.key as string | undefined,
		timeoutOverride: globals.timeout as number | undefined,
	});

	_client = new AgentOSClient({
		baseUrl: ctx.baseUrl,
		apiKey: ctx.securityKey,
		timeout: ctx.timeout * 1000, // seconds -> milliseconds
	});

	return _client;
}

/**
 * Reset the cached client. Exported for testing.
 */
export function resetClient(): void {
	_client = null;
}
