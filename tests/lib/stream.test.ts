import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock ora (ESM dynamic import)
const mockOraInstance = {
	start: vi.fn(),
	stop: vi.fn(),
	succeed: vi.fn(),
	fail: vi.fn(),
	text: "",
};
mockOraInstance.start.mockReturnValue(mockOraInstance);
vi.mock("ora", () => ({
	default: vi.fn(() => mockOraInstance),
}));

// Mock chalk to return strings without ANSI codes in tests
vi.mock("chalk", () => {
	const handler: ProxyHandler<Record<string, unknown>> = {
		get(_target, prop) {
			if (typeof prop === "string") {
				const fn = (s: string) => s;
				return new Proxy(fn, {
					get: (_t, p) => (typeof p === "string" ? new Proxy((ss: string) => ss, handler) : undefined),
					apply: (_t, _this, args) => String(args[0] ?? ""),
				});
			}
			return undefined;
		},
	};
	return { default: new Proxy({}, handler) };
});

// Mock paused-runs module
const mockWritePausedRun = vi.fn();
vi.mock("../../src/lib/paused-runs.js", () => ({
	writePausedRun: (...args: unknown[]) => mockWritePausedRun(...args),
}));

// Mock output helpers
const mockGetOutputFormat = vi.fn(() => "table" as "table" | "json");
vi.mock("../../src/lib/output.js", () => ({
	getOutputFormat: (...args: unknown[]) => mockGetOutputFormat(...(args as [Command])),
	writeError: vi.fn((msg: string) => {
		process.stderr.write(`Error: ${msg}\n`);
	}),
}));

import type { AgentStream, StreamEvent } from "@worksofadam/agentos-sdk";
import { handleNonStreamRun, handleStreamRun, printMetrics } from "../../src/lib/stream.js";

/**
 * Create a mock AgentStream from an array of events.
 */
function createMockStream(events: StreamEvent[]): AgentStream {
	let consumed = false;
	const controller = new AbortController();

	const stream = {
		controller,
		abort: () => controller.abort(),
		get aborted() {
			return controller.signal.aborted;
		},
		[Symbol.asyncIterator]() {
			if (consumed) throw new Error("Stream has already been consumed.");
			consumed = true;
			let index = 0;
			return {
				async next(): Promise<IteratorResult<StreamEvent>> {
					if (controller.signal.aborted || index >= events.length) {
						return { done: true, value: undefined };
					}
					return { done: false, value: events[index++] as StreamEvent };
				},
			};
		},
	} as unknown as AgentStream;

	return stream;
}

function createProgram(): Command {
	const program = new Command("agno");
	program.option("-o, --output <format>", "Output format", "table");
	return program;
}

describe("stream renderer", () => {
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		// Re-setup ora mock chain since restoreMocks clears mockReturnValue
		mockOraInstance.start.mockReturnValue(mockOraInstance);
		stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		mockGetOutputFormat.mockReturnValue("table");
		// Reset exitCode between tests
		process.exitCode = undefined;
	});

	describe("handleStreamRun", () => {
		it("writes RunContent event content to stdout in table mode", async () => {
			const events: StreamEvent[] = [
				{ event: "RunContent", content: "Hello ", created_at: 1 },
				{ event: "RunContent", content: "world!", created_at: 2 },
				{ event: "RunCompleted", content: "Hello world!", created_at: 3 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent");

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Hello ");
			expect(written).toContain("world!");
		});

		it("writes trailing newline after stream content", async () => {
			const events: StreamEvent[] = [
				{ event: "RunContent", content: "Hello", created_at: 1 },
				{ event: "RunCompleted", content: "Hello", created_at: 2 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent");

			// Last stdout.write call should be the trailing newline
			const calls = stdoutSpy.mock.calls;
			const lastCall = calls[calls.length - 1];
			expect(lastCall?.[0]).toBe("\n");
		});

		it("prints metrics from RunCompleted to stderr", async () => {
			const events: StreamEvent[] = [
				{ event: "RunContent", content: "Hi", created_at: 1 },
				{
					event: "RunCompleted",
					content: "Hi",
					created_at: 2,
					metrics: { input_tokens: 10, output_tokens: 20, total_tokens: 30, duration: 1.5 },
				},
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent");

			const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
			expect(stderrOutput).toContain("tokens:");
			expect(stderrOutput).toContain("10/20");
			expect(stderrOutput).toContain("1.50s");
		});

		it("collects events and outputs JSON array in json mode", async () => {
			mockGetOutputFormat.mockReturnValue("json");
			const events: StreamEvent[] = [
				{ event: "RunContent", content: "Hi", created_at: 1 },
				{ event: "RunCompleted", content: "Hi", created_at: 2 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent");

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed).toHaveLength(2);
			expect(parsed[0].event).toBe("RunContent");
		});

		it("registers SIGINT handler before iteration and removes in finally", async () => {
			const processSpy = vi.spyOn(process, "on");
			const removeListenerSpy = vi.spyOn(process, "removeListener");

			const events: StreamEvent[] = [{ event: "RunCompleted", content: "", created_at: 1 }];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent");

			expect(processSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
			expect(removeListenerSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));

			processSpy.mockRestore();
			removeListenerSpy.mockRestore();
		});

		it("handles stream abort gracefully (no crash on SIGINT)", async () => {
			const events: StreamEvent[] = [
				{ event: "RunContent", content: "partial", created_at: 1 },
			];
			const stream = createMockStream(events);

			// Simulate abort after first event
			const originalIterator = stream[Symbol.asyncIterator].bind(stream);
			let callCount = 0;
			(stream as unknown as Record<string, unknown>)[Symbol.asyncIterator] = function () {
				const iter = originalIterator();
				return {
					async next() {
						callCount++;
						if (callCount > 1) {
							stream.abort();
							return { done: true, value: undefined };
						}
						return iter.next();
					},
				};
			};

			const cmd = createProgram();
			// Should not throw
			await handleStreamRun(cmd, stream, "agent");
		});

		it("stringifies object content before writing", async () => {
			const events: StreamEvent[] = [
				{ event: "RunContent", content: { key: "value" }, created_at: 1 },
				{ event: "RunCompleted", content: "", created_at: 2 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent");

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain('"key"');
			expect(written).toContain('"value"');
		});

		it("handles RunError event with exit code 2", async () => {
			const events: StreamEvent[] = [
				{ event: "RunError", content: "", created_at: 1, error: "Something broke" },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent");

			expect(process.exitCode).toBe(2);
			const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
			expect(stderrOutput).toContain("Error");
		});

		it("filters TeamRunContent events for team resource type", async () => {
			const events: StreamEvent[] = [
				{ event: "TeamRunContent", content: "Team output", created_at: 1 },
				{ event: "TeamRunCompleted", content: "Team output", created_at: 2 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "team");

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Team output");
		});

		it("filters StepOutput events for workflow resource type", async () => {
			const events: StreamEvent[] = [
				{ event: "StepOutput", content: "Workflow step output", created_at: 1 },
				{ event: "WorkflowCompleted", content: "done", created_at: 2 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "workflow");

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Workflow step output");
		});

		it("detects RunPaused event and calls writePausedRun", async () => {
			const events: StreamEvent[] = [
				{ event: "RunStarted", session_id: "sess-1", agent_id: "a1", run_id: "r1", created_at: 1 },
				{ event: "RunContent", content: "partial", created_at: 2 },
				{
					event: "RunPaused",
					run_id: "r1",
					created_at: 3,
					tools: [
						{
							tool_call_id: "tc-1",
							tool_name: "execute_sql",
							tool_args: { query: "DROP TABLE" },
							created_at: 3,
						},
					],
				},
				{ event: "RunCompleted", content: "", created_at: 4 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent", { resourceId: "agent-123" });

			expect(mockWritePausedRun).toHaveBeenCalledWith(
				expect.objectContaining({
					agent_id: "agent-123",
					run_id: "r1",
					session_id: "sess-1",
					resource_type: "agent",
					tools: expect.arrayContaining([
						expect.objectContaining({ tool_call_id: "tc-1", tool_name: "execute_sql" }),
					]),
				}),
			);
		});

		it("displays tool info to stderr on RunPaused", async () => {
			const events: StreamEvent[] = [
				{ event: "RunStarted", session_id: "sess-1", agent_id: "a1", run_id: "r1", created_at: 1 },
				{
					event: "RunPaused",
					run_id: "r1",
					created_at: 2,
					tools: [
						{
							tool_call_id: "tc-1",
							tool_name: "execute_sql",
							tool_args: { query: "DROP TABLE" },
							created_at: 2,
						},
					],
				},
				{ event: "RunCompleted", content: "", created_at: 3 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent", { resourceId: "agent-123" });

			const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
			expect(stderrOutput).toContain("execute_sql");
			expect(stderrOutput).toContain("tc-1");
			expect(stderrOutput).toContain("To confirm:");
			expect(stderrOutput).toContain("To reject:");
		});

		it("captures session_id from RunStarted for RunPaused cache", async () => {
			const events: StreamEvent[] = [
				{ event: "RunStarted", session_id: "my-session", agent_id: "a1", run_id: "r1", created_at: 1 },
				{
					event: "RunPaused",
					run_id: "r1",
					created_at: 2,
					tools: [{ tool_call_id: "tc-1", tool_name: "test_tool", tool_args: {}, created_at: 2 }],
				},
				{ event: "RunCompleted", content: "", created_at: 3 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent", { resourceId: "a1" });

			expect(mockWritePausedRun).toHaveBeenCalledWith(
				expect.objectContaining({
					session_id: "my-session",
				}),
			);
		});

		it("includes RunPaused in JSON array output in json mode", async () => {
			mockGetOutputFormat.mockReturnValue("json");
			const events: StreamEvent[] = [
				{ event: "RunStarted", session_id: "s1", agent_id: "a1", run_id: "r1", created_at: 1 },
				{
					event: "RunPaused",
					run_id: "r1",
					created_at: 2,
					tools: [{ tool_call_id: "tc-1", tool_name: "test", tool_args: {}, created_at: 2 }],
				},
				{ event: "RunCompleted", content: "", created_at: 3 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "agent", { resourceId: "a1" });

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed.some((e: { event: string }) => e.event === "RunPaused")).toBe(true);
		});

		it("does not detect RunPaused for team resource type", async () => {
			const events: StreamEvent[] = [
				{ event: "TeamRunStarted", session_id: "s1", created_at: 1 },
				{
					event: "TeamRunPaused",
					created_at: 2,
					tools: [{ tool_call_id: "tc-1", tool_name: "test", tool_args: {}, created_at: 2 }],
				},
				{ event: "TeamRunCompleted", content: "", created_at: 3 },
			];
			const stream = createMockStream(events);
			const cmd = createProgram();

			await handleStreamRun(cmd, stream, "team", { resourceId: "team-1" });

			expect(mockWritePausedRun).not.toHaveBeenCalled();
		});
	});

	describe("handleNonStreamRun", () => {
		it("shows spinner on stderr, writes result content to stdout", async () => {
			const ora = (await import("ora")).default;

			const result = { content: "Run result", metrics: { total_tokens: 50, duration: 2.0 } };
			const cmd = createProgram();

			await handleNonStreamRun(cmd, () => Promise.resolve(result));

			expect(ora).toHaveBeenCalledWith(expect.objectContaining({ stream: process.stderr }));
			expect(mockOraInstance.start).toHaveBeenCalled();
			expect(mockOraInstance.stop).toHaveBeenCalled();
			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Run result");
		});

		it("writes full result as JSON in json mode", async () => {
			mockGetOutputFormat.mockReturnValue("json");
			const result = { content: "result", run_id: "r1" };
			const cmd = createProgram();

			await handleNonStreamRun(cmd, () => Promise.resolve(result));

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed.content).toBe("result");
			expect(parsed.run_id).toBe("r1");
		});

		it("stops spinner on error before rethrowing", async () => {
			const error = new Error("Run failed");
			const cmd = createProgram();

			await expect(handleNonStreamRun(cmd, () => Promise.reject(error))).rejects.toThrow("Run failed");

			expect(mockOraInstance.stop).toHaveBeenCalled();
		});

		it("handles object content by stringifying it", async () => {
			const result = { content: { structured: true }, metrics: null };
			const cmd = createProgram();

			await handleNonStreamRun(cmd, () => Promise.resolve(result));

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain('"structured"');
		});

		it("prints metrics to stderr after result", async () => {
			const result = {
				content: "done",
				metrics: { input_tokens: 5, output_tokens: 15, total_tokens: 20, duration: 0.8 },
			};
			const cmd = createProgram();

			await handleNonStreamRun(cmd, () => Promise.resolve(result));

			const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
			expect(stderrOutput).toContain("5/15");
			expect(stderrOutput).toContain("0.80s");
		});

		it("detects paused state in non-streaming response and writes cache", async () => {
			const result = {
				content: "partial",
				is_paused: true,
				run_id: "r1",
				session_id: "sess-1",
				tools: [
					{
						tool_call_id: "tc-1",
						tool_name: "execute_sql",
						tool_args: { query: "DROP TABLE" },
						created_at: 1,
					},
				],
			};
			const cmd = createProgram();

			await handleNonStreamRun(cmd, () => Promise.resolve(result), {
				resourceType: "agent",
				resourceId: "agent-123",
			});

			expect(mockWritePausedRun).toHaveBeenCalledWith(
				expect.objectContaining({
					agent_id: "agent-123",
					run_id: "r1",
					session_id: "sess-1",
					resource_type: "agent",
				}),
			);
			const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
			expect(stderrOutput).toContain("execute_sql");
			expect(stderrOutput).toContain("To confirm:");
		});

		it("does not detect paused state for non-agent resource type", async () => {
			const result = {
				content: "partial",
				is_paused: true,
				run_id: "r1",
				tools: [{ tool_call_id: "tc-1", tool_name: "test", tool_args: {}, created_at: 1 }],
			};
			const cmd = createProgram();

			await handleNonStreamRun(cmd, () => Promise.resolve(result), {
				resourceType: "team",
				resourceId: "team-1",
			});

			expect(mockWritePausedRun).not.toHaveBeenCalled();
		});
	});

	describe("printMetrics", () => {
		it("formats input/output tokens and duration to stderr", () => {
			printMetrics({ input_tokens: 10, output_tokens: 20, total_tokens: 30, duration: 1.5 });

			const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
			expect(stderrOutput).toContain("tokens: 10/20");
			expect(stderrOutput).toContain("time: 1.50s");
		});

		it("uses total_tokens when input/output not available", () => {
			printMetrics({ total_tokens: 50 });

			const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
			expect(stderrOutput).toContain("tokens: 50");
		});

		it("returns silently for null/undefined/empty metrics", () => {
			printMetrics(null);
			printMetrics(undefined);
			printMetrics({});

			expect(stderrSpy).not.toHaveBeenCalled();
		});
	});
});
