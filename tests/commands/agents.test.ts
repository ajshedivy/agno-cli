import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAgentsList = vi.fn();
const mockAgentsGet = vi.fn();
const mockAgentsRun = vi.fn();
const mockAgentsRunStream = vi.fn();
const mockAgentsContinue = vi.fn();
const mockAgentsCancel = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({
		agents: {
			list: mockAgentsList,
			get: mockAgentsGet,
			run: mockAgentsRun,
			runStream: mockAgentsRunStream,
			continue: mockAgentsContinue,
			cancel: mockAgentsCancel,
		},
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

const mockHandleStreamRun = vi.fn();
const mockHandleNonStreamRun = vi.fn();
vi.mock("../../src/lib/stream.js", () => ({
	handleStreamRun: (...args: unknown[]) => mockHandleStreamRun(...args),
	handleNonStreamRun: (...args: unknown[]) => mockHandleNonStreamRun(...args),
}));

import { agentCommand } from "../../src/commands/agents.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno");
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
			await program.parseAsync(["node", "agno", "agent", "list"]);

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
			await program.parseAsync(["node", "agno", "agent", "list"]);

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
			await program.parseAsync(["node", "agno", "agent", "list", "--limit", "5", "--page", "2"]);

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
			await program.parseAsync(["node", "agno", "agent", "list"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("agent get", () => {
		it("calls client.agents.get with agent ID and prints plain-text detail", async () => {
			mockAgentsGet.mockResolvedValue({
				id: "a1",
				name: "Agent 1",
				description: "A test agent",
				model: { model: "gpt-4", name: "GPT-4" },
			});

			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "get", "a1"]);

			expect(mockAgentsGet).toHaveBeenCalledWith("a1");
			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("ID:          a1");
			expect(written).toContain("Name:        Agent 1");
			expect(written).toContain("Description: A test agent");
			expect(written).toContain("Model:       gpt-4");

			stdoutSpy.mockRestore();
		});

		it("outputs raw JSON in json mode", async () => {
			const agentData = { id: "a1", name: "Agent 1", description: "Test" };
			mockAgentsGet.mockResolvedValue(agentData);
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "get", "a1"]);

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed.id).toBe("a1");

			stdoutSpy.mockRestore();
		});
	});

	describe("agent run", () => {
		it("calls client.agents.run and handleNonStreamRun without --stream", async () => {
			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "run", "a1", "hello"]);

			expect(mockHandleNonStreamRun).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
			expect(mockAgentsRunStream).not.toHaveBeenCalled();
		});

		it("calls handleNonStreamRun with correct run function", async () => {
			const runResult = { content: "Response", metrics: {} };
			mockAgentsRun.mockResolvedValue(runResult);

			// Capture the runFn and call it to verify it delegates correctly
			mockHandleNonStreamRun.mockImplementation(async (_cmd: unknown, runFn: () => Promise<unknown>) => {
				await runFn();
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "run", "a1", "hello"]);

			expect(mockAgentsRun).toHaveBeenCalledWith("a1", {
				message: "hello",
				sessionId: undefined,
				userId: undefined,
			});
		});

		it("calls client.agents.runStream and handleStreamRun with --stream", async () => {
			const mockStream = { fake: "stream" };
			mockAgentsRunStream.mockResolvedValue(mockStream);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "run", "a1", "hello", "--stream"]);

			expect(mockAgentsRunStream).toHaveBeenCalledWith("a1", {
				message: "hello",
				sessionId: undefined,
				userId: undefined,
			});
			expect(mockHandleStreamRun).toHaveBeenCalledWith(expect.anything(), mockStream, "agent");
		});

		it("passes --session-id and --user-id to run", async () => {
			mockHandleNonStreamRun.mockImplementation(async (_cmd: unknown, runFn: () => Promise<unknown>) => {
				await runFn();
			});

			const program = createProgram();
			await program.parseAsync([
				"node",
				"agno",
				"agent",
				"run",
				"a1",
				"hello",
				"--session-id",
				"s1",
				"--user-id",
				"u1",
			]);

			expect(mockAgentsRun).toHaveBeenCalledWith("a1", {
				message: "hello",
				sessionId: "s1",
				userId: "u1",
			});
		});

		it("passes --session-id and --user-id to runStream", async () => {
			mockAgentsRunStream.mockResolvedValue({ fake: "stream" });

			const program = createProgram();
			await program.parseAsync([
				"node",
				"agno",
				"agent",
				"run",
				"a1",
				"hello",
				"--stream",
				"--session-id",
				"s1",
				"--user-id",
				"u1",
			]);

			expect(mockAgentsRunStream).toHaveBeenCalledWith("a1", {
				message: "hello",
				sessionId: "s1",
				userId: "u1",
			});
		});

		it("handles run errors with handleError", async () => {
			const error = new Error("run failed");
			mockHandleNonStreamRun.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "run", "a1", "hello"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("agent continue", () => {
		it("calls client.agents.continue with tools=message (non-streaming)", async () => {
			mockAgentsContinue.mockResolvedValue({ content: "continued" });
			vi.mocked(getOutputFormat).mockReturnValue("table");
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "continue", "a1", "r1", "keep going"]);

			expect(mockAgentsContinue).toHaveBeenCalledWith("a1", "r1", {
				tools: "keep going",
				sessionId: undefined,
				userId: undefined,
				stream: false,
			});

			stdoutSpy.mockRestore();
		});

		it("calls continue with stream=true and handleStreamRun with --stream", async () => {
			const mockStream = { fake: "stream" };
			mockAgentsContinue.mockResolvedValue(mockStream);

			const program = createProgram();
			await program.parseAsync([
				"node",
				"agno",
				"agent",
				"continue",
				"a1",
				"r1",
				"keep going",
				"--stream",
			]);

			expect(mockAgentsContinue).toHaveBeenCalledWith("a1", "r1", {
				tools: "keep going",
				sessionId: undefined,
				userId: undefined,
				stream: true,
			});
			expect(mockHandleStreamRun).toHaveBeenCalledWith(expect.anything(), mockStream, "agent");
		});

		it("outputs JSON in json mode for non-streaming continue", async () => {
			const result = { content: "continued", run_id: "r1" };
			mockAgentsContinue.mockResolvedValue(result);
			vi.mocked(getOutputFormat).mockReturnValue("json");
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "continue", "a1", "r1", "msg"]);

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed.content).toBe("continued");

			stdoutSpy.mockRestore();
		});

		it("handles continue errors with handleError", async () => {
			const error = new Error("continue failed");
			mockAgentsContinue.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "continue", "a1", "r1", "msg"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("agent cancel", () => {
		it("calls client.agents.cancel and prints success", async () => {
			mockAgentsCancel.mockResolvedValue(undefined);
			const { writeSuccess } = await import("../../src/lib/output.js");

			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "cancel", "a1", "r1"]);

			expect(mockAgentsCancel).toHaveBeenCalledWith("a1", "r1");
			expect(writeSuccess).toHaveBeenCalledWith("Cancelled run r1 for agent a1");
		});

		it("handles cancel errors with handleError", async () => {
			const error = new Error("cancel failed");
			mockAgentsCancel.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "agent", "cancel", "a1", "r1"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});
});
