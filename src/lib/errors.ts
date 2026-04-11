import {
	APIError,
	AuthenticationError,
	BadRequestError,
	InternalServerError,
	NotFoundError,
	RateLimitError,
	RemoteServerUnavailableError,
	UnprocessableEntityError,
} from "@worksofadam/agentos-sdk";
import chalk from "chalk";

/**
 * Custom error for CLI config issues (context not found, YAML parse errors).
 */
export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

/**
 * Optional context for error messages. Provides resource type for 404s
 * and server URL for connection errors.
 */
export interface ErrorContext {
	resource?: string;
	url?: string;
}

/**
 * Check if an error is a network connection error (native Node.js errors).
 */
function isConnectionError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const code = (err as NodeJS.ErrnoException).code;
	if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ENOTFOUND") return true;
	if (err.message.includes("fetch failed")) return true;
	return false;
}

/**
 * Check if an error is a network APIError (SDK wraps TypeError as APIError(0, "Network error: ...")).
 */
function isNetworkAPIError(err: unknown): boolean {
	return err instanceof APIError && err.status === 0 && err.message.includes("Network error");
}

/**
 * Parse a 422 validation error message into a human-readable bullet list.
 * Handles FastAPI-style detail arrays: { detail: [{ loc: ["body", "name"], msg: "..." }] }
 * Falls back to raw message if not JSON or unexpected shape.
 */
function formatValidationError(message: string): string {
	try {
		const parsed = JSON.parse(message);
		if (parsed && Array.isArray(parsed.detail)) {
			const lines = parsed.detail.map((d: { loc?: string[]; msg?: string }) => {
				const field = d.loc?.slice(1).join(".") ?? "unknown";
				return `  - ${field}: ${d.msg ?? "invalid"}`;
			});
			return `Validation error:\n${lines.join("\n")}`;
		}
	} catch {
		/* not JSON, fall through */
	}
	return `Validation error: ${message}`;
}

/**
 * Write an error message to stderr with red "Error: " prefix.
 * Never writes to stdout -- stdout is reserved for data output.
 * Never includes raw stack traces -- only user-friendly messages.
 */
function writeErr(msg: string): void {
	process.stderr.write(`${chalk.red("Error:")} ${msg}\n`);
}

/**
 * Centralized error handler that maps SDK errors to actionable CLI messages.
 * Sets appropriate exit codes: 1 for user errors, 2 for system errors.
 *
 * Must be called in catch blocks of all command handlers.
 * Optional ctx parameter provides resource type for 404s and server URL for connection errors.
 */
export function handleError(err: unknown, ctx?: ErrorContext): never {
	if (err instanceof AuthenticationError) {
		writeErr("Authentication failed. Check your API key: agno-cli config show");
		process.exitCode = 1;
	} else if (err instanceof NotFoundError) {
		const what = ctx?.resource ?? "Resource";
		writeErr(`${what} not found.`);
		process.exitCode = 1;
	} else if (err instanceof BadRequestError) {
		writeErr(`Invalid request: ${err.message}`);
		process.exitCode = 1;
	} else if (err instanceof UnprocessableEntityError) {
		writeErr(formatValidationError(err.message));
		process.exitCode = 1;
	} else if (err instanceof RateLimitError) {
		writeErr("Rate limited. Wait and retry.");
		process.exitCode = 2;
	} else if (err instanceof InternalServerError) {
		writeErr(`Server error: ${err.message}\nRun \`agno-cli status\` for diagnostics.`);
		process.exitCode = 2;
	} else if (err instanceof RemoteServerUnavailableError) {
		writeErr("Server unavailable. Is AgentOS running?");
		process.exitCode = 2;
	} else if (isConnectionError(err) || isNetworkAPIError(err)) {
		const target = ctx?.url ? ` to ${ctx.url}` : "";
		writeErr(`Cannot connect${target} -- is the server running?`);
		process.exitCode = 2;
	} else if (err instanceof APIError && err.status === 403) {
		const isAdmin = err.message.toLowerCase().includes("admin");
		if (isAdmin) {
			writeErr("This operation requires admin scope. Check your API key permissions.");
		} else {
			writeErr("Access denied. Check your API key permissions.");
		}
		process.exitCode = 1;
	} else if (err instanceof APIError) {
		writeErr(`API error (${err.status}): ${err.message}`);
		process.exitCode = err.status >= 500 ? 2 : 1;
	} else if (err instanceof ConfigError) {
		writeErr(err.message);
		process.exitCode = 1;
	} else {
		writeErr(err instanceof Error ? err.message : String(err));
		process.exitCode = 2;
	}

	process.exit();
}
