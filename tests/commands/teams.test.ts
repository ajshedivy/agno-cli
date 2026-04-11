import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTeamsList = vi.fn();
const mockTeamsGet = vi.fn();
const mockTeamsRun = vi.fn();
const mockTeamsRunStream = vi.fn();
const mockTeamsContinue = vi.fn();
const mockTeamsCancel = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({
		teams: {
			list: mockTeamsList,
			get: mockTeamsGet,
			run: mockTeamsRun,
			runStream: mockTeamsRunStream,
			continue: mockTeamsContinue,
			cancel: mockTeamsCancel,
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

import { teamCommand } from "../../src/commands/teams.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(teamCommand);
	program.exitOverride();
	return program;
}

describe("team command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("team list", () => {
		it("calls client.teams.list and includes MODE column", async () => {
			mockTeamsList.mockResolvedValue([
				{ id: "t1", name: "Team 1", mode: "coordinate", description: "First team" },
				{ id: "t2", name: "Team 2", mode: "route", description: "Second team" },
			]);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "list"]);

			expect(mockTeamsList).toHaveBeenCalled();
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([expect.objectContaining({ id: "t1", name: "Team 1", mode: "coordinate" })]),
				expect.objectContaining({
					columns: ["ID", "NAME", "MODE", "DESCRIPTION"],
					keys: ["id", "name", "mode", "description"],
					meta: expect.objectContaining({ total_count: 2 }),
				}),
			);
		});

		it("handles error with handleError", async () => {
			const error = new Error("network error");
			mockTeamsList.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "list"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("team get", () => {
		it("calls client.teams.get and includes mode in detail", async () => {
			mockTeamsGet.mockResolvedValue({
				id: "t1",
				name: "Team 1",
				mode: "coordinate",
				description: "A test team",
				model: { model: "gpt-4", name: "GPT-4" },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "get", "t1"]);

			expect(mockTeamsGet).toHaveBeenCalledWith("t1");
			expect(mockOutputDetail).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					id: "t1",
					mode: "coordinate",
					model: "gpt-4",
				}),
				expect.objectContaining({
					labels: expect.arrayContaining(["Mode", "Model"]),
				}),
			);
		});

		it("outputs raw JSON in json mode", async () => {
			const teamData = { id: "t1", name: "Team 1", mode: "route" };
			mockTeamsGet.mockResolvedValue(teamData);
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "get", "t1"]);

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed.id).toBe("t1");

			stdoutSpy.mockRestore();
		});
	});

	describe("team run", () => {
		it("calls handleNonStreamRun without --stream", async () => {
			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "run", "t1", "hello"]);

			expect(mockHandleNonStreamRun).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
			expect(mockTeamsRunStream).not.toHaveBeenCalled();
		});

		it("calls handleNonStreamRun with correct run function", async () => {
			const runResult = { content: "Response", metrics: {} };
			mockTeamsRun.mockResolvedValue(runResult);

			mockHandleNonStreamRun.mockImplementation(async (_cmd: unknown, runFn: () => Promise<unknown>) => {
				await runFn();
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "run", "t1", "hello"]);

			expect(mockTeamsRun).toHaveBeenCalledWith("t1", {
				message: "hello",
				sessionId: undefined,
				userId: undefined,
			});
		});

		it("calls client.teams.runStream and handleStreamRun with --stream", async () => {
			const mockStream = { fake: "stream" };
			mockTeamsRunStream.mockResolvedValue(mockStream);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "run", "t1", "hello", "--stream"]);

			expect(mockTeamsRunStream).toHaveBeenCalledWith("t1", {
				message: "hello",
				sessionId: undefined,
				userId: undefined,
			});
			expect(mockHandleStreamRun).toHaveBeenCalledWith(expect.anything(), mockStream, "team");
		});

		it("passes --session-id and --user-id to run", async () => {
			mockHandleNonStreamRun.mockImplementation(async (_cmd: unknown, runFn: () => Promise<unknown>) => {
				await runFn();
			});

			const program = createProgram();
			await program.parseAsync([
				"node",
				"agno",
				"team",
				"run",
				"t1",
				"hello",
				"--session-id",
				"s1",
				"--user-id",
				"u1",
			]);

			expect(mockTeamsRun).toHaveBeenCalledWith("t1", {
				message: "hello",
				sessionId: "s1",
				userId: "u1",
			});
		});

		it("passes --session-id and --user-id to runStream", async () => {
			mockTeamsRunStream.mockResolvedValue({ fake: "stream" });

			const program = createProgram();
			await program.parseAsync([
				"node",
				"agno",
				"team",
				"run",
				"t1",
				"hello",
				"--stream",
				"--session-id",
				"s1",
				"--user-id",
				"u1",
			]);

			expect(mockTeamsRunStream).toHaveBeenCalledWith("t1", {
				message: "hello",
				sessionId: "s1",
				userId: "u1",
			});
		});

		it("handles run errors with handleError", async () => {
			const error = new Error("run failed");
			mockHandleNonStreamRun.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "run", "t1", "hello"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("team continue", () => {
		it("calls client.teams.continue with tools=message (non-streaming)", async () => {
			mockTeamsContinue.mockResolvedValue({ content: "continued" });
			vi.mocked(getOutputFormat).mockReturnValue("table");
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "continue", "t1", "r1", "keep going"]);

			expect(mockTeamsContinue).toHaveBeenCalledWith("t1", "r1", {
				tools: "keep going",
				sessionId: undefined,
				userId: undefined,
				stream: false,
			});

			stdoutSpy.mockRestore();
		});

		it("calls continue with stream=true and handleStreamRun with --stream", async () => {
			const mockStream = { fake: "stream" };
			mockTeamsContinue.mockResolvedValue(mockStream);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "continue", "t1", "r1", "keep going", "--stream"]);

			expect(mockTeamsContinue).toHaveBeenCalledWith("t1", "r1", {
				tools: "keep going",
				sessionId: undefined,
				userId: undefined,
				stream: true,
			});
			expect(mockHandleStreamRun).toHaveBeenCalledWith(expect.anything(), mockStream, "team");
		});

		it("outputs JSON in json mode for non-streaming continue", async () => {
			const result = { content: "continued", run_id: "r1" };
			mockTeamsContinue.mockResolvedValue(result);
			vi.mocked(getOutputFormat).mockReturnValue("json");
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "continue", "t1", "r1", "msg"]);

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed.content).toBe("continued");

			stdoutSpy.mockRestore();
		});

		it("handles continue errors with handleError", async () => {
			const error = new Error("continue failed");
			mockTeamsContinue.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "continue", "t1", "r1", "msg"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});

	describe("team cancel", () => {
		it("calls client.teams.cancel and prints success", async () => {
			mockTeamsCancel.mockResolvedValue(undefined);
			const { writeSuccess } = await import("../../src/lib/output.js");

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "cancel", "t1", "r1"]);

			expect(mockTeamsCancel).toHaveBeenCalledWith("t1", "r1");
			expect(writeSuccess).toHaveBeenCalledWith("Cancelled run r1 for team t1");
		});

		it("handles cancel errors with handleError", async () => {
			const error = new Error("cancel failed");
			mockTeamsCancel.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "team", "cancel", "t1", "r1"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});
});
