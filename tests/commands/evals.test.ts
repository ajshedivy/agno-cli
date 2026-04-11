import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEvalsList = vi.fn();
const mockEvalsGet = vi.fn();
const mockEvalsDelete = vi.fn();

vi.mock("../../src/lib/client.js", () => ({
	getBaseUrl: vi.fn(() => "http://localhost:8000"),
	getClient: vi.fn(() => ({
		evals: {
			list: mockEvalsList,
			get: mockEvalsGet,
			delete: mockEvalsDelete,
		},
	})),
}));

const mockOutputList = vi.fn();
const mockOutputDetail = vi.fn();
const mockPrintJson = vi.fn();
const mockWriteSuccess = vi.fn();
vi.mock("../../src/lib/output.js", () => ({
	getOutputFormat: vi.fn(() => "table"),
	outputList: (...args: unknown[]) => mockOutputList(...args),
	outputDetail: (...args: unknown[]) => mockOutputDetail(...args),
	printJson: (...args: unknown[]) => mockPrintJson(...args),
	writeError: vi.fn(),
	writeSuccess: (...args: unknown[]) => mockWriteSuccess(...args),
}));

const mockHandleError = vi.fn();
vi.mock("../../src/lib/errors.js", () => ({
	handleError: (...args: unknown[]) => mockHandleError(...args),
}));

import { evalCommand } from "../../src/commands/evals.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(evalCommand);
	program.exitOverride();
	return program;
}

describe("eval command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("eval list", () => {
		it("calls client.evals.list with default pagination", async () => {
			mockEvalsList.mockResolvedValue({
				data: [{ id: "e1", name: "eval1", eval_type: "accuracy", agent_id: "a1", created_at: "2024-01-01" }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "eval", "list"]);

			expect(mockEvalsList).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([expect.objectContaining({ id: "e1", name: "eval1", eval_type: "accuracy" })]),
				expect.objectContaining({
					columns: ["ID", "NAME", "EVAL_TYPE", "AGENT_ID", "CREATED_AT"],
					meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
				}),
			);
		});

		it("forwards --agent-id and --type filters", async () => {
			mockEvalsList.mockResolvedValue({
				data: [],
				meta: { page: 1, limit: 20, total_pages: 0, total_count: 0 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "eval", "list", "--agent-id", "a1", "--type", "accuracy"]);

			expect(mockEvalsList).toHaveBeenCalledWith(expect.objectContaining({ agentId: "a1", type: "accuracy" }));
		});

		it("outputs JSON with data and meta in json mode", async () => {
			mockEvalsList.mockResolvedValue({
				data: [{ id: "e1" }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const program = createProgram();
			await program.parseAsync(["node", "agno", "eval", "list"]);

			expect(mockPrintJson).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.any(Array),
					meta: expect.objectContaining({ page: 1 }),
				}),
			);
		});
	});

	describe("eval get", () => {
		it("calls client.evals.get with eval run ID", async () => {
			mockEvalsGet.mockResolvedValue({
				id: "e1",
				name: "eval1",
				eval_type: "accuracy",
				agent_id: "a1",
				input: "What is 2+2?",
				output: "4",
				expected_output: "4",
				score: 1.0,
				created_at: "2024-01-01",
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "eval", "get", "e1"]);

			expect(mockEvalsGet).toHaveBeenCalledWith("e1", { dbId: undefined });
			expect(mockOutputDetail).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ id: "e1", name: "eval1", score: 1.0 }),
				expect.objectContaining({
					labels: ["ID", "Name", "Eval Type", "Agent ID", "Input", "Output", "Expected Output", "Score", "Created At"],
				}),
			);
		});

		it("passes --db-id to SDK get call", async () => {
			mockEvalsGet.mockResolvedValue({
				id: "e1",
				name: "eval1",
				eval_type: "accuracy",
				agent_id: "a1",
				input: "What is 2+2?",
				output: "4",
				expected_output: "4",
				score: 1.0,
				created_at: "2024-01-01",
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "eval", "get", "e1", "--db-id", "mydb"]);

			expect(mockEvalsGet).toHaveBeenCalledWith("e1", { dbId: "mydb" });
		});
	});

	describe("eval delete", () => {
		it("parses comma-separated IDs into array and calls delete", async () => {
			mockEvalsDelete.mockResolvedValue(undefined);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "eval", "delete", "--ids", "id1,id2,id3"]);

			expect(mockEvalsDelete).toHaveBeenCalledWith(expect.objectContaining({ ids: ["id1", "id2", "id3"] }));
			expect(mockWriteSuccess).toHaveBeenCalledWith("Eval runs deleted.");
		});

		it("trims whitespace from IDs", async () => {
			mockEvalsDelete.mockResolvedValue(undefined);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "eval", "delete", "--ids", "id1, id2 , id3"]);

			expect(mockEvalsDelete).toHaveBeenCalledWith(expect.objectContaining({ ids: ["id1", "id2", "id3"] }));
		});
	});

	describe("error handling", () => {
		it("catches errors and calls handleError", async () => {
			const error = new Error("network error");
			mockEvalsList.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "eval", "list"]);

			expect(mockHandleError).toHaveBeenCalledWith(error, expect.anything());
		});
	});
});
