import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAgentsList = vi.fn();
const mockAgentsGet = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({
		agents: { list: mockAgentsList, get: mockAgentsGet },
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

import { agentCommand } from "../../src/commands/agents.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno-os");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(agentCommand);
	program.exitOverride();
	return program;
}

describe("agent command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("agent list", () => {
		it("calls client.agents.list and passes data to outputList", async () => {
			mockAgentsList.mockResolvedValue([
				{ id: "a1", name: "Agent 1", description: "First agent" },
				{ id: "a2", name: "Agent 2", description: "Second agent" },
			]);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "agent", "list"]);

			expect(mockAgentsList).toHaveBeenCalled();
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ id: "a1", name: "Agent 1" }),
					expect.objectContaining({ id: "a2", name: "Agent 2" }),
				]),
				expect.objectContaining({
					columns: ["ID", "NAME", "DESCRIPTION"],
					keys: ["id", "name", "description"],
					meta: expect.objectContaining({
						page: 1,
						limit: 20,
						total_count: 2,
						total_pages: 1,
					}),
				}),
			);
		});

		it("includes pagination metadata in output", async () => {
			mockAgentsList.mockResolvedValue([
				{ id: "a1", name: "Agent 1", description: "" },
				{ id: "a2", name: "Agent 2", description: "" },
				{ id: "a3", name: "Agent 3", description: "" },
			]);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "agent", "list"]);

			const callArgs = mockOutputList.mock.calls[0];
			expect(callArgs[2].meta).toEqual({
				page: 1,
				limit: 20,
				total_pages: 1,
				total_count: 3,
			});
		});

		it("slices results correctly with --limit and --page", async () => {
			const agents = Array.from({ length: 10 }, (_, i) => ({
				id: `a${i}`,
				name: `Agent ${i}`,
				description: `Desc ${i}`,
			}));
			mockAgentsList.mockResolvedValue(agents);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "agent", "list", "--limit", "5", "--page", "2"]);

			const callArgs = mockOutputList.mock.calls[0];
			// Page 2 with limit 5 should return items 5-9
			expect(callArgs[1]).toHaveLength(5);
			expect(callArgs[1][0]).toEqual(expect.objectContaining({ id: "a5" }));
			expect(callArgs[2].meta).toEqual({
				page: 2,
				limit: 5,
				total_pages: 2,
				total_count: 10,
			});
		});

		it("handles error with handleError", async () => {
			const error = new Error("network error");
			mockAgentsList.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "agent", "list"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("agent get", () => {
		it("calls client.agents.get with agent ID and passes to outputDetail", async () => {
			mockAgentsGet.mockResolvedValue({
				id: "a1",
				name: "Agent 1",
				description: "A test agent",
				model: { model: "gpt-4", name: "GPT-4" },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "agent", "get", "a1"]);

			expect(mockAgentsGet).toHaveBeenCalledWith("a1");
			expect(mockOutputDetail).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					id: "a1",
					name: "Agent 1",
					description: "A test agent",
					model: "gpt-4",
				}),
				expect.objectContaining({
					labels: ["ID", "Name", "Description", "Model"],
					keys: ["id", "name", "description", "model"],
				}),
			);
		});

		it("outputs raw JSON in json mode", async () => {
			const agentData = { id: "a1", name: "Agent 1", description: "Test" };
			mockAgentsGet.mockResolvedValue(agentData);
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "agent", "get", "a1"]);

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed.id).toBe("a1");

			stdoutSpy.mockRestore();
		});
	});
});
