import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMetricsGet = vi.fn();
const mockMetricsRefresh = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({
		metrics: { get: mockMetricsGet, refresh: mockMetricsRefresh },
	})),
}));

const mockOutputList = vi.fn();
const mockPrintJson = vi.fn();
const mockWriteSuccess = vi.fn();
vi.mock("../../src/lib/output.js", () => ({
	getOutputFormat: vi.fn(() => "table"),
	outputList: (...args: unknown[]) => mockOutputList(...args),
	outputDetail: vi.fn(),
	printJson: (...args: unknown[]) => mockPrintJson(...args),
	writeError: vi.fn(),
	writeSuccess: (...args: unknown[]) => mockWriteSuccess(...args),
}));

const mockHandleError = vi.fn();
vi.mock("../../src/lib/errors.js", () => ({
	handleError: (...args: unknown[]) => mockHandleError(...args),
}));

import { metricsCommand } from "../../src/commands/metrics.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(metricsCommand);
	program.exitOverride();
	return program;
}

describe("metrics command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("metrics get", () => {
		it("calls client.metrics.get and outputs daily metrics", async () => {
			mockMetricsGet.mockResolvedValue({
				metrics: [
					{
						date: "2026-01-15",
						agent_runs_count: 10,
						team_runs_count: 5,
						workflow_runs_count: 2,
						users_count: 3,
					},
				],
				updated_at: "2026-01-15T12:00:00Z",
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "metrics", "get"]);

			expect(mockMetricsGet).toHaveBeenCalledWith({
				startingDate: undefined,
				endingDate: undefined,
			});
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({
						date: "2026-01-15",
						agent_runs_count: 10,
						team_runs_count: 5,
						workflow_runs_count: 2,
						users_count: 3,
					}),
				]),
				expect.objectContaining({
					columns: ["DATE", "AGENT_RUNS", "TEAM_RUNS", "WORKFLOW_RUNS", "USERS"],
				}),
			);
		});

		it("forwards date filters to SDK", async () => {
			mockMetricsGet.mockResolvedValue({ metrics: [], updated_at: null });

			const program = createProgram();
			await program.parseAsync([
				"node",
				"agno",
				"metrics",
				"get",
				"--start-date",
				"2026-01-01",
				"--end-date",
				"2026-01-31",
			]);

			expect(mockMetricsGet).toHaveBeenCalledWith({
				startingDate: "2026-01-01",
				endingDate: "2026-01-31",
			});
		});

		it("outputs JSON with printJson in json mode", async () => {
			const response = {
				metrics: [{ date: "2026-01-15", agent_runs_count: 10 }],
				updated_at: "2026-01-15T12:00:00Z",
			};
			mockMetricsGet.mockResolvedValue(response);
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const program = createProgram();
			await program.parseAsync(["node", "agno", "metrics", "get"]);

			expect(mockPrintJson).toHaveBeenCalledWith(response);
			expect(mockOutputList).not.toHaveBeenCalled();
		});

		it("handles error with handleError", async () => {
			const error = new Error("network error");
			mockMetricsGet.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "metrics", "get"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("metrics refresh", () => {
		it("calls client.metrics.refresh and prints success", async () => {
			mockMetricsRefresh.mockResolvedValue(undefined);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "metrics", "refresh"]);

			expect(mockMetricsRefresh).toHaveBeenCalled();
			expect(mockWriteSuccess).toHaveBeenCalledWith("Metrics refresh triggered.");
		});

		it("handles error with handleError", async () => {
			const error = new Error("refresh failed");
			mockMetricsRefresh.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "metrics", "refresh"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});
});
