import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMemoriesList = vi.fn();
const mockMemoriesGet = vi.fn();
const mockMemoriesCreate = vi.fn();
const mockMemoriesUpdate = vi.fn();
const mockMemoriesDelete = vi.fn();
const mockMemoriesDeleteAll = vi.fn();
const mockMemoriesGetTopics = vi.fn();
const mockMemoriesGetStats = vi.fn();
const mockMemoriesOptimize = vi.fn();

vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({
		memories: {
			list: mockMemoriesList,
			get: mockMemoriesGet,
			create: mockMemoriesCreate,
			update: mockMemoriesUpdate,
			delete: mockMemoriesDelete,
			deleteAll: mockMemoriesDeleteAll,
			getTopics: mockMemoriesGetTopics,
			getStats: mockMemoriesGetStats,
			optimize: mockMemoriesOptimize,
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

import { memoryCommand } from "../../src/commands/memories.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno-os");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(memoryCommand);
	program.exitOverride();
	return program;
}

describe("memory command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("memory list", () => {
		it("calls client.memories.list with default pagination", async () => {
			mockMemoriesList.mockResolvedValue({
				data: [{ memory_id: "m1", memory: "test", topics: ["t1"], user_id: "u1" }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "memory", "list"]);

			expect(mockMemoriesList).toHaveBeenCalledWith(
				expect.objectContaining({ page: 1, limit: 20 }),
			);
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ memory_id: "m1", memory: "test", topics: "t1" }),
				]),
				expect.objectContaining({
					columns: ["ID", "MEMORY", "TOPICS", "USER_ID"],
					keys: ["memory_id", "memory", "topics", "user_id"],
					meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
				}),
			);
		});

		it("parses --topics into array and forwards filters", async () => {
			mockMemoriesList.mockResolvedValue({
				data: [],
				meta: { page: 1, limit: 20, total_pages: 0, total_count: 0 },
			});

			const program = createProgram();
			await program.parseAsync([
				"node", "agno-os", "memory", "list",
				"--user-id", "u1",
				"--topics", "t1,t2",
			]);

			expect(mockMemoriesList).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "u1",
					topics: ["t1", "t2"],
				}),
			);
		});

		it("outputs JSON with data and meta in json mode", async () => {
			mockMemoriesList.mockResolvedValue({
				data: [{ memory_id: "m1" }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "memory", "list"]);

			expect(mockPrintJson).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.any(Array),
					meta: expect.objectContaining({ page: 1 }),
				}),
			);
		});
	});

	describe("memory get", () => {
		it("calls client.memories.get with memory ID", async () => {
			mockMemoriesGet.mockResolvedValue({
				memory_id: "m1",
				memory: "test content",
				topics: ["a", "b"],
				agent_id: "ag1",
				team_id: null,
				user_id: "u1",
				updated_at: "2024-01-01",
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "memory", "get", "m1"]);

			expect(mockMemoriesGet).toHaveBeenCalledWith("m1", { dbId: undefined });
			expect(mockOutputDetail).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					memory_id: "m1",
					memory: "test content",
					topics: "a, b",
				}),
				expect.objectContaining({
					labels: ["Memory ID", "Memory", "Topics", "Agent ID", "Team ID", "User ID", "Updated At"],
				}),
			);
		});
	});

	describe("memory create", () => {
		it("calls create with parsed topics array", async () => {
			mockMemoriesCreate.mockResolvedValue({
				memory_id: "m-new",
				memory: "test content",
				topics: ["a", "b"],
				user_id: "u1",
			});

			const program = createProgram();
			await program.parseAsync([
				"node", "agno-os", "memory", "create",
				"--memory", "test content",
				"--topics", "a,b",
			]);

			expect(mockMemoriesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					memory: "test content",
					topics: ["a", "b"],
				}),
			);
			expect(mockWriteSuccess).toHaveBeenCalledWith("Memory created.");
		});
	});

	describe("memory update", () => {
		it("calls update with memory content", async () => {
			mockMemoriesUpdate.mockResolvedValue({});

			const program = createProgram();
			await program.parseAsync([
				"node", "agno-os", "memory", "update", "m1",
				"--memory", "updated content",
			]);

			expect(mockMemoriesUpdate).toHaveBeenCalledWith(
				"m1",
				expect.objectContaining({ memory: "updated content" }),
			);
			expect(mockWriteSuccess).toHaveBeenCalledWith("Memory updated.");
		});
	});

	describe("memory delete", () => {
		it("calls client.memories.delete with memory ID", async () => {
			mockMemoriesDelete.mockResolvedValue(undefined);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "memory", "delete", "m1"]);

			expect(mockMemoriesDelete).toHaveBeenCalledWith("m1", { dbId: undefined });
			expect(mockWriteSuccess).toHaveBeenCalledWith("Memory deleted.");
		});
	});

	describe("memory delete-all", () => {
		it("parses comma-separated IDs and calls deleteAll", async () => {
			mockMemoriesDeleteAll.mockResolvedValue(undefined);

			const program = createProgram();
			await program.parseAsync([
				"node", "agno-os", "memory", "delete-all",
				"--ids", "id1,id2",
			]);

			expect(mockMemoriesDeleteAll).toHaveBeenCalledWith(
				expect.objectContaining({
					memoryIds: ["id1", "id2"],
				}),
			);
			expect(mockWriteSuccess).toHaveBeenCalledWith("Memories deleted.");
		});
	});

	describe("memory topics", () => {
		it("calls client.memories.getTopics", async () => {
			mockMemoriesGetTopics.mockResolvedValue(["topic1", "topic2"]);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "memory", "topics"]);

			expect(mockMemoriesGetTopics).toHaveBeenCalledWith(
				expect.objectContaining({}),
			);
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				[{ topic: "topic1" }, { topic: "topic2" }],
				expect.objectContaining({ columns: ["TOPIC"], keys: ["topic"] }),
			);
		});
	});

	describe("memory stats", () => {
		it("calls client.memories.getStats", async () => {
			mockMemoriesGetStats.mockResolvedValue([
				{ user_id: "u1", total_memories: 5, last_updated: "2024-01-01" },
			]);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "memory", "stats"]);

			expect(mockMemoriesGetStats).toHaveBeenCalledWith(
				expect.objectContaining({}),
			);
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ user_id: "u1", total_memories: 5 }),
				]),
				expect.objectContaining({
					columns: ["USER_ID", "TOTAL_MEMORIES", "LAST_UPDATED"],
				}),
			);
		});
	});

	describe("memory optimize", () => {
		it("calls optimize with all params", async () => {
			mockMemoriesOptimize.mockResolvedValue({ optimized: true });

			const program = createProgram();
			await program.parseAsync([
				"node", "agno-os", "memory", "optimize",
				"--user-id", "u1",
				"--model", "gpt-4",
				"--apply",
			]);

			expect(mockMemoriesOptimize).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "u1",
					model: "gpt-4",
					apply: true,
				}),
			);
			expect(mockWriteSuccess).toHaveBeenCalledWith("Memory optimization applied.");
		});

		it("reports 'previewed' when --apply is not set", async () => {
			mockMemoriesOptimize.mockResolvedValue({ optimized: false });

			const program = createProgram();
			await program.parseAsync([
				"node", "agno-os", "memory", "optimize",
				"--user-id", "u1",
			]);

			expect(mockMemoriesOptimize).toHaveBeenCalledWith(
				expect.objectContaining({ userId: "u1" }),
			);
			expect(mockWriteSuccess).toHaveBeenCalledWith("Memory optimization previewed.");
		});
	});

	describe("error handling", () => {
		it("catches errors and calls handleError", async () => {
			const error = new Error("network error");
			mockMemoriesList.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno-os", "memory", "list"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});
});
