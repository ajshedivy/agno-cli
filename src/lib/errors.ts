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
 * Check if an error is a network connection error.
 */
function isConnectionError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const code = (err as NodeJS.ErrnoException).code;
	if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ENOTFOUND") return true;
	if (err.message.includes("fetch failed")) return true;
	return false;
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
 */
export function handleError(err: unknown): never {
	if (err instanceof AuthenticationError) {
		writeErr("Authentication failed. Check your API key: agno-os config show");
		process.exitCode = 1;
	} else if (err instanceof NotFoundError) {
		writeErr("Not found. Run agno-os <resource> list to see available items.");
		process.exitCode = 1;
	} else if (err instanceof BadRequestError) {
		writeErr(`Invalid request: ${err.message}`);
		process.exitCode = 1;
	} else if (err instanceof UnprocessableEntityError) {
		writeErr(`Validation error: ${err.message}`);
		process.exitCode = 1;
	} else if (err instanceof RateLimitError) {
		writeErr("Rate limited. Wait and retry.");
		process.exitCode = 2;
	} else if (err instanceof InternalServerError) {
		writeErr(`Server error: ${err.message}`);
		process.exitCode = 2;
	} else if (err instanceof RemoteServerUnavailableError) {
		writeErr("Server unavailable. Is AgentOS running?");
		process.exitCode = 2;
	} else if (err instanceof APIError) {
		writeErr(`API error (${err.status}): ${err.message}`);
		process.exitCode = err.status >= 500 ? 2 : 1;
	} else if (err instanceof ConfigError) {
		writeErr(err.message);
		process.exitCode = 1;
	} else if (isConnectionError(err)) {
		writeErr("Cannot connect to server. Is AgentOS running?");
		process.exitCode = 2;
	} else {
		writeErr(err instanceof Error ? err.message : String(err));
		process.exitCode = 2;
	}

	process.exit();
}
