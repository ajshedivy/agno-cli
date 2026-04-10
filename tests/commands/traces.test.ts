import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTracesList = vi.fn();
const mockTracesGet = vi.fn();
const mockTracesGetStats = vi.fn();
const mockTracesSearch = vi.fn();

vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({
		traces: {
			list: mockTracesList,
			get: mockTracesGet,
			getStats: mockTracesGetStats,
			search: mockTracesSearch,
		},
	})),
}));

const mockOutputList = vi.fn();
const mockOutputDetail = vi.fn();
const mockPrintJson = vi.fn();
const mockWriteError = vi.fn();
vi.mock("../../src/lib/output.js", () => ({
	getOutputFormat: vi.fn(() => "table"),
	outputList: (...args: unknown[]) => mockOutputList(...args),
	outputDetail: (...args: unknown[]) => mockOutputDetail(...args),
	printJson: (...args: unknown[]) => mockPrintJson(...args),
	writeError: (...args: unknown[]) => mockWriteError(...args),
	writeSuccess: vi.fn(),
}));

const mockHandleError = vi.fn();
vi.mock("../../src/lib/errors.js", () => ({
	handleError: (...args: unknown[]) => mockHandleError(...args),
}));

import { traceCommand } from "../../src/commands/traces.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno-os");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(traceCommand);
	program.exitOverride();
	return program;
}

describe("trace command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("trace list", () => {
		it("calls client.traces.list with default pagination", async () => {
			mockTracesList.mockResolvedValue({
				data: [{ trace_id: "t1", name: "trace1", status: "completed", duration: 100, start_time: "2024-01-01" }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "trace", "list"]);

			expect(mockTracesList).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([expect.objectContaining({ trace_id: "t1", name: "trace1" })]),
				expect.objectContaining({
					columns: ["TRACE_ID", "NAME", "STATUS", "DURATION", "START_TIME"],
					meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
				}),
			);
		});

		it("forwards --run-id and --status filters to SDK", async () => {
			mockTracesList.mockResolvedValue({
				data: [],
				meta: { page: 1, limit: 20, total_pages: 0, total_count: 0 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "trace", "list", "--run-id", "r1", "--status", "completed"]);

			expect(mockTracesList).toHaveBeenCalledWith(expect.objectContaining({ runId: "r1", status: "completed" }));
		});
	});

	describe("trace get", () => {
		it("calls client.traces.get with trace ID", async () => {
			mockTracesGet.mockResolvedValue({
				trace_id: "t1",
				name: "trace1",
				status: "completed",
				duration: 100,
				start_time: "2024-01-01",
				end_time: "2024-01-02",
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "trace", "get", "t1"]);

			expect(mockTracesGet).toHaveBeenCalledWith("t1");
			expect(mockOutputDetail).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ trace_id: "t1", name: "trace1" }),
				expect.objectContaining({
					labels: ["Trace ID", "Name", "Status", "Duration", "Start Time", "End Time", "Error"],
				}),
			);
		});

		it("outputs JSON in json mode", async () => {
			mockTracesGet.mockResolvedValue({ trace_id: "t1" });
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "trace", "get", "t1"]);

			expect(mockPrintJson).toHaveBeenCalledWith(expect.objectContaining({ trace_id: "t1" }));
		});
	});

	describe("trace stats", () => {
		it("calls client.traces.getStats with agent ID filter", async () => {
			mockTracesGetStats.mockResolvedValue({
				data: [{ session_id: "s1", run_count: 5, total_tokens: 1000, avg_duration: 50 }],
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "trace", "stats", "--agent-id", "a1"]);

			expect(mockTracesGetStats).toHaveBeenCalledWith(expect.objectContaining({ agentId: "a1" }));
		});

		it("outputs JSON in json mode", async () => {
			mockTracesGetStats.mockResolvedValue({ some: "stats" });
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "trace", "stats"]);

			expect(mockPrintJson).toHaveBeenCalledWith(expect.objectContaining({ some: "stats" }));
		});
	});

	describe("trace search", () => {
		it("parses valid JSON --filter and calls search", async () => {
			mockTracesSearch.mockResolvedValue({
				data: [{ trace_id: "t1", name: "trace1", status: "completed", duration: 100 }],
			});

			const program = createProgram();
			await program.parseAsync([
				"node",
				"agno-os",
				"trace",
				"search",
				"--filter",
				'{"status":"completed"}',
				"--group-by",
				"run",
			]);

			expect(mockTracesSearch).toHaveBeenCalledWith(
				expect.objectContaining({
					filter: { status: "completed" },
					groupBy: "run",
				}),
			);
		});

		it("rejects invalid JSON for --filter without calling SDK", async () => {
			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "trace", "search", "--filter", "invalid"]);

			expect(mockWriteError).toHaveBeenCalledWith("Invalid JSON for --filter");
			expect(mockTracesSearch).not.toHaveBeenCalled();
		});
	});

	describe("error handling", () => {
		it("catches errors and calls handleError", async () => {
			const error = new Error("network error");
			mockTracesList.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "trace", "list"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});
});
