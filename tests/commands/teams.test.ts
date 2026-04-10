import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTeamsList = vi.fn();
const mockTeamsGet = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({
		teams: { list: mockTeamsList, get: mockTeamsGet },
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

import { teamCommand } from "../../src/commands/teams.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno-os");
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
			await program.parseAsync(["node", "agno-os", "team", "list"]);

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
			await program.parseAsync(["node", "agno-os", "team", "list"]);

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
			await program.parseAsync(["node", "agno-os", "team", "get", "t1"]);

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
			await program.parseAsync(["node", "agno-os", "team", "get", "t1"]);

			const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed.id).toBe("t1");

			stdoutSpy.mockRestore();
		});
	});
});
