import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWorkflowsList = vi.fn();
const mockWorkflowsGet = vi.fn();
const mockWorkflowsRun = vi.fn();
const mockWorkflowsRunStream = vi.fn();
const mockWorkflowsContinue = vi.fn();
const mockWorkflowsCancel = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({
		workflows: {
			list: mockWorkflowsList,
			get: mockWorkflowsGet,
			run: mockWorkflowsRun,
			runStream: mockWorkflowsRunStream,
			continue: mockWorkflowsContinue,
			cancel: mockWorkflowsCancel,
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
				expect.arrayContaining([expect.objectContaining({ id: "w1", name: "Workflow 1" })]),
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

	describe("workflow run", () => {
		it("calls handleNonStreamRun without --stream", async () => {
			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "run", "w1", "hello"]);

			expect(mockHandleNonStreamRun).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
			expect(mockWorkflowsRunStream).not.toHaveBeenCalled();
		});

		it("calls handleNonStreamRun with correct run function", async () => {
			const runResult = { content: "Response", metrics: {} };
			mockWorkflowsRun.mockResolvedValue(runResult);

			mockHandleNonStreamRun.mockImplementation(async (_cmd: unknown, runFn: () => Promise<unknown>) => {
				await runFn();
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "run", "w1", "hello"]);

			expect(mockWorkflowsRun).toHaveBeenCalledWith("w1", {
				message: "hello",
				sessionId: undefined,
				userId: undefined,
			});
		});

		it("calls client.workflows.runStream and handleStreamRun with --stream", async () => {
			const mockStream = { fake: "stream" };
			mockWorkflowsRunStream.mockResolvedValue(mockStream);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "run", "w1", "hello", "--stream"]);

			expect(mockWorkflowsRunStream).toHaveBeenCalledWith("w1", {
				message: "hello",
				sessionId: undefined,
				userId: undefined,
			});
			expect(mockHandleStreamRun).toHaveBeenCalledWith(expect.anything(), mockStream, "workflow");
		});

		it("passes --session-id and --user-id to run", async () => {
			mockHandleNonStreamRun.mockImplementation(async (_cmd: unknown, runFn: () => Promise<unknown>) => {
				await runFn();
			});

			const program = createProgram();
			await program.parseAsync([
				"node",
				"agno-os",
				"workflow",
				"run",
				"w1",
				"hello",
				"--session-id",
				"s1",
				"--user-id",
				"u1",
			]);

			expect(mockWorkflowsRun).toHaveBeenCalledWith("w1", {
				message: "hello",
				sessionId: "s1",
				userId: "u1",
			});
		});

		it("passes --session-id and --user-id to runStream", async () => {
			mockWorkflowsRunStream.mockResolvedValue({ fake: "stream" });

			const program = createProgram();
			await program.parseAsync([
				"node",
				"agno-os",
				"workflow",
				"run",
				"w1",
				"hello",
				"--stream",
				"--session-id",
				"s1",
				"--user-id",
				"u1",
			]);

			expect(mockWorkflowsRunStream).toHaveBeenCalledWith("w1", {
				message: "hello",
				sessionId: "s1",
				userId: "u1",
			});
		});

		it("handles run errors with handleError", async () => {
			const error = new Error("run failed");
			mockHandleNonStreamRun.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "run", "w1", "hello"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("workflow continue", () => {
		it("calls client.workflows.continue with tools=message (non-streaming)", async () => {
			mockWorkflowsContinue.mockResolvedValue({ content: "continued" });
			vi.mocked(getOutputFormat).mockReturnValue("table");
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "continue", "w1", "r1", "keep going"]);

			expect(mockWorkflowsContinue).toHaveBeenCalledWith("w1", "r1", {
				tools: "keep going",
				sessionId: undefined,
				userId: undefined,
				stream: false,
			});

			stdoutSpy.mockRestore();
		});

		it("calls continue with stream=true and handleStreamRun with --stream", async () => {
			const mockStream = { fake: "stream" };
			mockWorkflowsContinue.mockResolvedValue(mockStream);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "continue", "w1", "r1", "keep going", "--stream"]);

			expect(mockWorkflowsContinue).toHaveBeenCalledWith("w1", "r1", {
				tools: "keep going",
				sessionId: undefined,
				userId: undefined,
				stream: true,
			});
			expect(mockHandleStreamRun).toHaveBeenCalledWith(expect.anything(), mockStream, "workflow");
		});

		it("outputs JSON in json mode for non-streaming continue", async () => {
			const result = { content: "continued", run_id: "r1" };
			mockWorkflowsContinue.mockResolvedValue(result);
			vi.mocked(getOutputFormat).mockReturnValue("json");
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "continue", "w1", "r1", "msg"]);

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed.content).toBe("continued");

			stdoutSpy.mockRestore();
		});

		it("handles continue errors with handleError", async () => {
			const error = new Error("continue failed");
			mockWorkflowsContinue.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "continue", "w1", "r1", "msg"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("workflow cancel", () => {
		it("calls client.workflows.cancel and prints success", async () => {
			mockWorkflowsCancel.mockResolvedValue(undefined);
			const { writeSuccess } = await import("../../src/lib/output.js");

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "cancel", "w1", "r1"]);

			expect(mockWorkflowsCancel).toHaveBeenCalledWith("w1", "r1");
			expect(writeSuccess).toHaveBeenCalledWith("Cancelled run r1 for workflow w1");
		});

		it("handles cancel errors with handleError", async () => {
			const error = new Error("cancel failed");
			mockWorkflowsCancel.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "workflow", "cancel", "w1", "r1"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});
});
