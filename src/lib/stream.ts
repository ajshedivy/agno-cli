import type { AgentStream, StreamEvent } from "@worksofadam/agentos-sdk";
import chalk from "chalk";
import type { Command } from "commander";
import { getOutputFormat, writeError } from "./output.js";

/**
 * Resource types supported by the stream renderer.
 */
export type ResourceType = "agent" | "team" | "workflow";

/**
 * Content event names by resource type.
 * Each resource type emits different event names for content chunks.
 */
const CONTENT_EVENTS: Record<ResourceType, string> = {
	agent: "RunContent",
	team: "TeamRunContent",
	workflow: "StepOutput",
} as const;

/**
 * Completion event names by resource type.
 * These events carry metrics and signal stream end.
 */
const COMPLETED_EVENTS: Record<ResourceType, string> = {
	agent: "RunCompleted",
	team: "TeamRunCompleted",
	workflow: "WorkflowCompleted",
} as const;

/**
 * Error event names by resource type.
 */
const ERROR_EVENTS: Record<ResourceType, string> = {
	agent: "RunError",
	team: "TeamRunError",
	workflow: "WorkflowCancelled",
} as const;

/**
 * Format content for output, handling both string and object types.
 */
function formatContent(content: unknown): string {
	if (content == null) return "";
	return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

/**
 * Consume a streaming run, handling SIGINT and output formatting.
 *
 * In table mode: filters for content events and writes text incrementally to stdout.
 * In JSON mode: collects all events and writes a JSON array to stdout after stream ends.
 *
 * Registers a SIGINT handler before iteration to cleanly abort the stream,
 * and removes it in the finally block to prevent handler accumulation.
 */
export async function handleStreamRun(
	cmd: Command,
	stream: AgentStream,
	resourceType: ResourceType,
): Promise<void> {
	const format = getOutputFormat(cmd);
	const contentEvent = CONTENT_EVENTS[resourceType];
	const completedEvent = COMPLETED_EVENTS[resourceType];
	const errorEvent = ERROR_EVENTS[resourceType];

	// Register SIGINT handler for clean abort
	const onSigint = () => {
		stream.abort();
	};
	process.on("SIGINT", onSigint);

	try {
		if (format === "json") {
			const events: StreamEvent[] = [];
			for await (const event of stream) {
				events.push(event);
			}
			process.stdout.write(`${JSON.stringify(events, null, 2)}\n`);
		} else {
			let metrics: Record<string, unknown> | undefined;
			for await (const event of stream) {
				if (event.event === errorEvent) {
					const errorMsg = (event as Record<string, unknown>).error ?? (event as Record<string, unknown>).content ?? "Unknown stream error";
					writeError(String(errorMsg));
					process.exitCode = 2;
				} else if (event.event === contentEvent) {
					const content = (event as Record<string, unknown>).content;
					if (content != null) {
						process.stdout.write(formatContent(content));
					}
				} else if (event.event === completedEvent) {
					metrics = (event as Record<string, unknown>).metrics as Record<string, unknown> | undefined;
				}
			}
			// Ensure trailing newline after streamed content
			process.stdout.write("\n");
			if (metrics) {
				printMetrics(metrics);
			}
		}
	} finally {
		process.removeListener("SIGINT", onSigint);
	}
}

/**
 * Execute a non-streaming run with an ora spinner on stderr.
 *
 * Shows a spinner while waiting for the run to complete,
 * then writes the result content to stdout.
 * Stops the spinner on error before rethrowing.
 */
export async function handleNonStreamRun(
	cmd: Command,
	runFn: () => Promise<unknown>,
): Promise<void> {
	const format = getOutputFormat(cmd);

	// Import ora (ESM-only package)
	const ora = (await import("ora")).default;
	const spinner = ora({ text: "Running...", stream: process.stderr }).start();

	try {
		const result = await runFn();
		spinner.stop();

		if (format === "json") {
			process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		} else {
			const content = (result as Record<string, unknown>)?.content;
			if (content != null) {
				process.stdout.write(`${formatContent(content)}\n`);
			}
			const metrics = (result as Record<string, unknown>)?.metrics as Record<string, unknown> | undefined;
			if (metrics) {
				printMetrics(metrics);
			}
		}
	} catch (err) {
		spinner.stop();
		throw err;
	}
}

/**
 * Format and print run metrics to stderr.
 *
 * Displays token counts (input/output or total) and duration.
 * Writes nothing if metrics is null, undefined, or empty.
 */
export function printMetrics(metrics: Record<string, unknown> | undefined | null): void {
	if (!metrics) return;

	const parts: string[] = [];
	const inputTokens = metrics.input_tokens as number | undefined;
	const outputTokens = metrics.output_tokens as number | undefined;
	const totalTokens = metrics.total_tokens as number | undefined;
	const duration = metrics.duration as number | undefined;

	if (inputTokens && outputTokens) {
		parts.push(`tokens: ${inputTokens}/${outputTokens}`);
	} else if (totalTokens) {
		parts.push(`tokens: ${totalTokens}`);
	}

	if (duration) {
		parts.push(`time: ${duration.toFixed(2)}s`);
	}

	if (parts.length > 0) {
		process.stderr.write(`${chalk.dim(`[${parts.join(", ")}]`)}\n`);
	}
}
