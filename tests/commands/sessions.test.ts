import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSessionsList = vi.fn();
const mockSessionsGet = vi.fn();
const mockSessionsCreate = vi.fn();
const mockSessionsUpdate = vi.fn();
const mockSessionsDelete = vi.fn();
const mockSessionsDeleteAll = vi.fn();
const mockSessionsGetRuns = vi.fn();

vi.mock("../../src/lib/client.js", () => ({
	getBaseUrl: vi.fn(() => "http://localhost:8000"),
	getClient: vi.fn(() => ({
		sessions: {
			list: mockSessionsList,
			get: mockSessionsGet,
			create: mockSessionsCreate,
			update: mockSessionsUpdate,
			delete: mockSessionsDelete,
			deleteAll: mockSessionsDeleteAll,
			getRuns: mockSessionsGetRuns,
		},
	})),
}));

const mockOutputList = vi.fn();
const mockOutputDetail = vi.fn();
const mockPrintJson = vi.fn();
const mockWriteError = vi.fn();
const mockWriteSuccess = vi.fn();
vi.mock("../../src/lib/output.js", () => ({
	getOutputFormat: vi.fn(() => "table"),
	outputList: (...args: unknown[]) => mockOutputList(...args),
	outputDetail: (...args: unknown[]) => mockOutputDetail(...args),
	printJson: (...args: unknown[]) => mockPrintJson(...args),
	writeError: (...args: unknown[]) => mockWriteError(...args),
	writeSuccess: (...args: unknown[]) => mockWriteSuccess(...args),
}));

const mockHandleError = vi.fn();
vi.mock("../../src/lib/errors.js", () => ({
	handleError: (...args: unknown[]) => mockHandleError(...args),
}));

import { sessionCommand } from "../../src/commands/sessions.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(sessionCommand);
	program.exitOverride();
	return program;
}

describe("session command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("session list", () => {
		it("calls client.sessions.list with default page/limit and passes data with meta", async () => {
			mockSessionsList.mockResolvedValue({
				data: [{ session_id: "s1", session_name: "test", type: "agent", created_at: "2024-01-01" }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "session", "list"]);

			expect(mockSessionsList).toHaveBeenCalledWith(
				expect.objectContaining({ page: 1, limit: 20 }),
			);
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ session_id: "s1", name: "test" }),
				]),
				expect.objectContaining({
					columns: ["SESSION_ID", "NAME", "TYPE", "CREATED_AT"],
					keys: ["session_id", "name", "type", "created_at"],
					meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
				}),
			);
		});

		it("forwards --type, --limit, --page filters to SDK", async () => {
			mockSessionsList.mockResolvedValue({
				data: [],
				meta: { page: 2, limit: 5, total_pages: 3, total_count: 15 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "session", "list", "--type", "agent", "--limit", "5", "--page", "2"]);

			expect(mockSessionsList).toHaveBeenCalledWith(
				expect.objectContaining({ type: "agent", limit: 5, page: 2 }),
			);
		});

		it("passes --db-id to SDK list call", async () => {
			mockSessionsList.mockResolvedValue({
				data: [],
				meta: { page: 1, limit: 20, total_pages: 0, total_count: 0 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "session", "list", "--db-id", "mydb"]);

			expect(mockSessionsList).toHaveBeenCalledWith(expect.objectContaining({ dbId: "mydb" }));
		});

		it("outputs JSON with data and meta in json mode", async () => {
			mockSessionsList.mockResolvedValue({
				data: [{ session_id: "s1", session_name: "test" }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const program = createProgram();
			await program.parseAsync(["node", "agno", "session", "list"]);

			expect(mockPrintJson).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.any(Array),
					meta: expect.objectContaining({ page: 1 }),
				}),
			);
		});
	});

	describe("session get", () => {
		it("calls client.sessions.get with session ID and renders detail", async () => {
			mockSessionsGet.mockResolvedValue({
				session_id: "s1",
				session_name: "test",
				type: "agent",
				session_state: { key: "val" },
				created_at: "2024-01-01",
				updated_at: "2024-01-02",
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "session", "get", "s1"]);

			expect(mockSessionsGet).toHaveBeenCalledWith("s1", { dbId: undefined });
			expect(mockOutputDetail).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					session_id: "s1",
					name: "test",
					state: '{"key":"val"}',
				}),
				expect.objectContaining({
					labels: ["Session ID", "Name", "Type", "State", "Created At", "Updated At"],
				}),
			);
		});
	});

	describe("session create", () => {
		it("calls client.sessions.create with required options", async () => {
			mockSessionsCreate.mockResolvedValue({
				session_id: "s-new",
				session_name: "new session",
				type: "agent",
				created_at: "2024-01-01",
			});

			const program = createProgram();
			await program.parseAsync([
				"node", "agno", "session", "create",
				"--type", "agent",
				"--component-id", "abc",
			]);

			expect(mockSessionsCreate).toHaveBeenCalledWith(
				expect.objectContaining({ type: "agent", componentId: "abc" }),
			);
			expect(mockWriteSuccess).toHaveBeenCalledWith("Session created.");
		});
	});

	describe("session update", () => {
		it("parses valid JSON --state and calls update", async () => {
			mockSessionsUpdate.mockResolvedValue({});

			const program = createProgram();
			await program.parseAsync([
				"node", "agno", "session", "update", "s1",
				"--name", "updated",
				"--state", '{"key":"val"}',
			]);

			expect(mockSessionsUpdate).toHaveBeenCalledWith(
				"s1",
				expect.objectContaining({
					sessionName: "updated",
					sessionState: { key: "val" },
				}),
			);
			expect(mockWriteSuccess).toHaveBeenCalledWith("Session updated.");
		});

		it("rejects invalid JSON for --state without calling SDK", async () => {
			const program = createProgram();
			await program.parseAsync([
				"node", "agno", "session", "update", "s1",
				"--state", "not-json",
			]);

			expect(mockWriteError).toHaveBeenCalledWith("Invalid JSON for --state");
			expect(mockSessionsUpdate).not.toHaveBeenCalled();
		});

		it("rejects invalid JSON for --metadata without calling SDK", async () => {
			const program = createProgram();
			await program.parseAsync([
				"node", "agno", "session", "update", "s1",
				"--metadata", "{bad",
			]);

			expect(mockWriteError).toHaveBeenCalledWith("Invalid JSON for --metadata");
			expect(mockSessionsUpdate).not.toHaveBeenCalled();
		});
	});

	describe("session delete", () => {
		it("calls client.sessions.delete with session ID", async () => {
			mockSessionsDelete.mockResolvedValue(undefined);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "session", "delete", "s1"]);

			expect(mockSessionsDelete).toHaveBeenCalledWith("s1", { dbId: undefined });
			expect(mockWriteSuccess).toHaveBeenCalledWith("Session deleted.");
		});
	});

	describe("session delete-all", () => {
		it("parses comma-separated IDs and types, calls deleteAll", async () => {
			mockSessionsDeleteAll.mockResolvedValue(undefined);

			const program = createProgram();
			await program.parseAsync([
				"node", "agno", "session", "delete-all",
				"--ids", "id1,id2,id3",
				"--types", "agent,agent,team",
			]);

			expect(mockSessionsDeleteAll).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionIds: ["id1", "id2", "id3"],
					sessionTypes: ["agent", "agent", "team"],
				}),
			);
			expect(mockWriteSuccess).toHaveBeenCalledWith("Sessions deleted.");
		});
	});

	describe("session runs", () => {
		it("calls client.sessions.getRuns with session ID", async () => {
			mockSessionsGetRuns.mockResolvedValue([
				{ run_id: "r1", status: "completed", created_at: "2024-01-01" },
			]);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "session", "runs", "s1"]);

			expect(mockSessionsGetRuns).toHaveBeenCalledWith("s1", { dbId: undefined });
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ run_id: "r1", status: "completed" }),
				]),
				expect.objectContaining({
					columns: ["RUN_ID", "STATUS", "CREATED_AT"],
				}),
			);
		});

		it("passes --db-id to SDK getRuns call", async () => {
			mockSessionsGetRuns.mockResolvedValue([
				{ run_id: "r1", status: "completed", created_at: "2024-01-01" },
			]);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "session", "runs", "s1", "--db-id", "mydb"]);

			expect(mockSessionsGetRuns).toHaveBeenCalledWith("s1", { dbId: "mydb" });
		});

		it("outputs JSON with data wrapper in json mode", async () => {
			mockSessionsGetRuns.mockResolvedValue([{ run_id: "r1" }]);
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const program = createProgram();
			await program.parseAsync(["node", "agno", "session", "runs", "s1"]);

			expect(mockPrintJson).toHaveBeenCalledWith({ data: [{ run_id: "r1" }] });
		});
	});

	describe("error handling", () => {
		it("catches errors and calls handleError", async () => {
			const error = new Error("network error");
			mockSessionsList.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "session", "list"]);

			expect(mockHandleError).toHaveBeenCalledWith(error, expect.anything());
		});
	});
});
