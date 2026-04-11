import chalk from "chalk";
import Table from "cli-table3";
import type { Command } from "commander";

/**
 * Determine output format from command options or TTY detection.
 * Returns "json" when explicitly requested, when --json flag is used, or when stdout is not a TTY (piped).
 * Returns "table" when explicitly requested or when stdout is a TTY (interactive).
 */
export function getOutputFormat(cmd: Command): "table" | "json" {
	const globals = cmd.optsWithGlobals();
	if (globals.json !== undefined) return "json"; // --json implies JSON output (D-19)
	if (globals.output === "json") return "json";
	if (globals.output === "table") return "table";
	return process.stdout.isTTY ? "table" : "json";
}

/**
 * Get field selection from --json flag if present.
 * Returns the comma-separated field string when --json was used with a value (e.g., --json id,name).
 * Returns undefined when --json was used without a value or not used at all.
 */
export function getJsonFields(cmd: Command): string | undefined {
	const globals = cmd.optsWithGlobals();
	if (typeof globals.json === "string") return globals.json;
	return undefined;
}

/**
 * Select specific fields from a data object or array of objects.
 * Used by --json field1,field2 to filter output to only requested fields.
 */
export function selectFields(
	data: Record<string, unknown> | Record<string, unknown>[],
	fields: string,
): unknown {
	const fieldList = fields.split(",").map((f) => f.trim());
	if (Array.isArray(data)) {
		return data.map((item) => pickFields(item, fieldList));
	}
	return pickFields(data, fieldList);
}

/**
 * Pick only specified fields from an object.
 */
function pickFields(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const field of fields) {
		if (field in obj) {
			result[field] = obj[field];
		}
	}
	return result;
}

/**
 * Render a list of records as either a JSON array or a cli-table3 table.
 * JSON mode wraps data in a { data: [...] } envelope for consistent parsing.
 * When opts.meta is provided, JSON output includes pagination metadata.
 */
export function outputList(
	cmd: Command,
	data: Record<string, unknown>[],
	opts: {
		columns: string[];
		keys: string[];
		meta?: { page: number; limit: number; total_pages: number; total_count: number };
	},
): void {
	const format = getOutputFormat(cmd);
	if (format === "json") {
		const fields = getJsonFields(cmd);
		if (fields) {
			// --json field1,field2: output only selected fields, no envelope
			const filtered = selectFields(data, fields);
			process.stdout.write(`${JSON.stringify(filtered, null, 2)}\n`);
			return;
		}
		// Standard JSON: full data with envelope
		const envelope: Record<string, unknown> = { data };
		if (opts.meta) envelope.meta = opts.meta;
		process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
		return;
	}

	const colWidths = calculateColWidths(opts.columns.length);
	const table = new Table({
		head: opts.columns.map((c) => chalk.bold(c)),
		style: { head: [], border: [] },
		...(colWidths ? { colWidths } : {}),
	});

	for (const row of data) {
		table.push(opts.keys.map((key) => String(row[key] ?? "")));
	}

	process.stdout.write(`${table.toString()}\n`);
}

/**
 * Render a single record as either JSON or a key-value table.
 */
export function outputDetail(
	cmd: Command,
	data: Record<string, unknown>,
	opts: { labels: string[]; keys: string[] },
): void {
	const format = getOutputFormat(cmd);
	if (format === "json") {
		const fields = getJsonFields(cmd);
		if (fields) {
			const filtered = selectFields(data, fields);
			process.stdout.write(`${JSON.stringify(filtered, null, 2)}\n`);
			return;
		}
		process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
		return;
	}

	const maxLabelLen = Math.max(...opts.labels.map((l) => l.length));
	const lines: string[] = [];
	for (let i = 0; i < opts.labels.length; i++) {
		const label = opts.labels[i];
		const key = opts.keys[i];
		if (label !== undefined && key !== undefined) {
			const padded = `${label}:`.padEnd(maxLabelLen + 2);
			lines.push(`${chalk.bold(padded)} ${String(data[key] ?? "")}`);
		}
	}
	process.stdout.write(`${lines.join("\n")}\n`);
}

/**
 * Write raw JSON to stdout. For commands that always want JSON regardless of format flag.
 */
export function printJson(data: unknown): void {
	process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Write an error message to stderr with red "Error: " prefix.
 */
export function writeError(msg: string): void {
	process.stderr.write(`${chalk.red("Error:")} ${msg}\n`);
}

/**
 * Write a success message to stderr (not stdout -- stdout is data-only).
 */
export function writeSuccess(msg: string): void {
	process.stderr.write(`${chalk.green("Success:")} ${msg}\n`);
}

/**
 * Write a warning message to stderr.
 */
export function writeWarning(msg: string): void {
	process.stderr.write(`${chalk.yellow("Warning:")} ${msg}\n`);
}

/**
 * Write verbose request details to stderr when --verbose is active.
 * Silent when verbose is not enabled.
 */
export function writeVerbose(cmd: Command, method: string, url: string, status?: number, durationMs?: number): void {
	const globals = cmd.optsWithGlobals();
	if (!globals.verbose) return;

	const parts = [method, url];
	if (status != null) parts.push(`-> ${status}`);
	if (durationMs != null) parts.push(`(${durationMs}ms)`);

	process.stderr.write(`${chalk.dim(parts.join(" "))}\n`);
}

/**
 * Mask an API key for safe display. Shows first 3 + last 4 characters.
 * Returns "(not set)" for undefined, null, or empty strings.
 */
export function maskKey(key: string | undefined | null): string {
	if (!key) return "(not set)";
	return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

/**
 * Handle --no-color flag by setting NO_COLOR env var so chalk auto-disables.
 * Commander's --no-color sets color=false in options.
 */
export function handleNoColorFlag(cmd: Command): void {
	const globals = cmd.optsWithGlobals();
	if (globals.color === false) {
		process.env.NO_COLOR = "1";
	}
}

/**
 * Calculate even column widths based on terminal width.
 * Returns undefined if terminal width is unknown (lets cli-table3 auto-size).
 */
function calculateColWidths(numCols: number): number[] | undefined {
	const termWidth = process.stdout.columns;
	if (!termWidth) return undefined;

	// Reserve 3 chars per column for borders/padding
	const available = termWidth - numCols * 3;
	const colWidth = Math.max(10, Math.floor(available / numCols));
	return Array.from({ length: numCols }, () => colWidth);
}
