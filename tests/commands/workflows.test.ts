import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWorkflowsList = vi.fn();
const mockWorkflowsGet = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({
		workflows: { list: mockWorkflowsList, get: mockWorkflowsGet },
	})),
}));

const mockOutputList = vi.fn();
const mockOutputDetail = vi.fn();
vi.mock("../../src/lib/output.js", () => ({
	getOutputFormat: vi.fn(() => "table"),
	outputList: (...args: unknown[]) => mockOutputList(...args),
	outputDetail: (...args: unknown[]) => mockOutputDetail(...args),
	printJson: vi.fn(),
	writeError: vi.fn(),
	writeSuccess: vi.fn(),
}));

const mockHandleError = vi.fn();
vi.mock("../../src/lib/errors.js", () => ({
	handleError: (...args: unknown[]) => mockHandleError(...args),
}));

import { workflowCommand } from "../../src/commands/workflows.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno-os");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(workflowCommand);
	program.exitOverride();
	return program;
}

describe("workflow command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("workflow list", () => {
		it("calls client.workflows.list and passes data to outputList", async () => {
			mockWorkflowsList.mockResolvedValue([
				{ id: "w1", name: "Workflow 1", description: "First workflow" },
				{ id: "w2", name: "Workflow 2", description: "Second workflow" },
			]);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "list"]);

			expect(mockWorkflowsList).toHaveBeenCalled();
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ id: "w1", name: "Workflow 1" }),
				]),
				expect.objectContaining({
					columns: ["ID", "NAME", "DESCRIPTION"],
					keys: ["id", "name", "description"],
					meta: expect.objectContaining({ total_count: 2 }),
				}),
			);
		});

		it("handles error with handleError", async () => {
			const error = new Error("network error");
			mockWorkflowsList.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "list"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("workflow get", () => {
		it("calls client.workflows.get and displays detail", async () => {
			mockWorkflowsGet.mockResolvedValue({
				id: "w1",
				name: "Workflow 1",
				description: "A test workflow",
				steps: [{}, {}],
				workflow_agent: false,
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "get", "w1"]);

			expect(mockWorkflowsGet).toHaveBeenCalledWith("w1");
			expect(mockOutputDetail).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					id: "w1",
					name: "Workflow 1",
					steps: 2,
					workflow_agent: "No",
				}),
				expect.objectContaining({
					labels: expect.arrayContaining(["Steps", "Workflow Agent"]),
				}),
			);
		});

		it("outputs raw JSON in json mode", async () => {
			const wfData = { id: "w1", name: "Workflow 1", description: "Test" };
			mockWorkflowsGet.mockResolvedValue(wfData);
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "get", "w1"]);

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed.id).toBe("w1");

			stdoutSpy.mockRestore();
		});
	});
});
