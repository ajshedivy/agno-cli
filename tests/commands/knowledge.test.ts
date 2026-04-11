import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockKnowledgeList = vi.fn();
const mockKnowledgeGet = vi.fn();
const mockKnowledgeSearch = vi.fn();
const mockKnowledgeGetStatus = vi.fn();
const mockKnowledgeDelete = vi.fn();
const mockKnowledgeDeleteAll = vi.fn();
const mockKnowledgeGetConfig = vi.fn();

vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({
		knowledge: {
			list: mockKnowledgeList,
			get: mockKnowledgeGet,
			search: mockKnowledgeSearch,
			getStatus: mockKnowledgeGetStatus,
			delete: mockKnowledgeDelete,
			deleteAll: mockKnowledgeDeleteAll,
			getConfig: mockKnowledgeGetConfig,
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

import { knowledgeCommand } from "../../src/commands/knowledge.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(knowledgeCommand);
	program.exitOverride();
	return program;
}

describe("knowledge command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("knowledge list", () => {
		it("calls client.knowledge.list with default pagination and passes data with meta", async () => {
			mockKnowledgeList.mockResolvedValue({
				data: [{ id: "k1", name: "test", status: "ready", type: "file" }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "list"]);

			expect(mockKnowledgeList).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([expect.objectContaining({ id: "k1", name: "test", status: "ready", type: "file" })]),
				expect.objectContaining({
					columns: ["ID", "NAME", "STATUS", "TYPE"],
					keys: ["id", "name", "status", "type"],
					meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
				}),
			);
		});

		it("outputs JSON with data and meta in json mode", async () => {
			mockKnowledgeList.mockResolvedValue({
				data: [{ id: "k1", name: "test" }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "list"]);

			expect(mockPrintJson).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.any(Array),
					meta: expect.objectContaining({ page: 1 }),
				}),
			);
		});
	});

	describe("knowledge get", () => {
		it("calls client.knowledge.get with content ID and renders detail", async () => {
			mockKnowledgeGet.mockResolvedValue({
				id: "k1",
				name: "test doc",
				status: "ready",
				type: "file",
				content: "some content",
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "get", "k1"]);

			expect(mockKnowledgeGet).toHaveBeenCalledWith("k1", undefined);
			expect(mockOutputDetail).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ id: "k1", name: "test doc", content: "some content" }),
				expect.objectContaining({
					labels: ["ID", "Name", "Status", "Type", "Content"],
				}),
			);
		});
	});

	describe("knowledge search", () => {
		it("calls search with default search type (vector)", async () => {
			mockKnowledgeSearch.mockResolvedValue({
				data: [{ id: "k1", content: "result", name: "doc", reranking_score: 0.95 }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "search", "test query"]);

			expect(mockKnowledgeSearch).toHaveBeenCalledWith("test query", expect.objectContaining({ searchType: "vector" }));
		});

		it("forwards --search-type and --max-results options", async () => {
			mockKnowledgeSearch.mockResolvedValue({
				data: [],
				meta: { page: 1, limit: 20, total_pages: 0, total_count: 0 },
			});

			const program = createProgram();
			await program.parseAsync([
				"node",
				"agno",
				"knowledge",
				"search",
				"test",
				"--search-type",
				"keyword",
				"--max-results",
				"5",
			]);

			expect(mockKnowledgeSearch).toHaveBeenCalledWith(
				"test",
				expect.objectContaining({ searchType: "keyword", maxResults: 5 }),
			);
		});

		it("truncates content longer than 80 chars in table output", async () => {
			const longContent = "A".repeat(200);
			mockKnowledgeSearch.mockResolvedValue({
				data: [{ id: "k1", content: longContent, name: "doc", reranking_score: 0.9 }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "search", "test"]);

			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({
						content: `${"A".repeat(77)}...`,
					}),
				]),
				expect.anything(),
			);
		});

		it("does not truncate content shorter than 80 chars", async () => {
			const shortContent = "Short content";
			mockKnowledgeSearch.mockResolvedValue({
				data: [{ id: "k1", content: shortContent, name: "doc", reranking_score: 0.9 }],
				meta: { page: 1, limit: 20, total_pages: 1, total_count: 1 },
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "search", "test"]);

			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([expect.objectContaining({ content: shortContent })]),
				expect.anything(),
			);
		});
	});

	describe("knowledge status", () => {
		it("calls client.knowledge.getStatus with content ID", async () => {
			mockKnowledgeGetStatus.mockResolvedValue({
				content_id: "k1",
				status: "ready",
				progress: "100%",
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "status", "k1"]);

			expect(mockKnowledgeGetStatus).toHaveBeenCalledWith("k1", undefined);
			expect(mockOutputDetail).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ content_id: "k1", status: "ready" }),
				expect.objectContaining({
					labels: ["Content ID", "Status", "Progress", "Error"],
				}),
			);
		});
	});

	describe("knowledge delete", () => {
		it("calls client.knowledge.delete with content ID and prints success", async () => {
			mockKnowledgeDelete.mockResolvedValue(undefined);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "delete", "k1"]);

			expect(mockKnowledgeDelete).toHaveBeenCalledWith("k1", undefined);
			expect(mockWriteSuccess).toHaveBeenCalledWith("Knowledge content deleted.");
		});
	});

	describe("knowledge delete-all", () => {
		it("calls client.knowledge.deleteAll", async () => {
			mockKnowledgeDeleteAll.mockResolvedValue(undefined);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "delete-all"]);

			expect(mockKnowledgeDeleteAll).toHaveBeenCalledWith(undefined);
			expect(mockWriteSuccess).toHaveBeenCalledWith("All knowledge content deleted.");
		});
	});

	describe("knowledge config", () => {
		it("calls client.knowledge.getConfig", async () => {
			mockKnowledgeGetConfig.mockResolvedValue({
				readers: ["pdf", "text"],
				chunkers: ["recursive"],
				vector_dbs: ["pgvector"],
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "config"]);

			expect(mockKnowledgeGetConfig).toHaveBeenCalledWith(undefined);
		});

		it("outputs JSON in json mode", async () => {
			mockKnowledgeGetConfig.mockResolvedValue({ readers: [] });
			vi.mocked(getOutputFormat).mockReturnValue("json");

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "config"]);

			expect(mockPrintJson).toHaveBeenCalledWith(expect.objectContaining({ readers: [] }));
		});
	});

	describe("error handling", () => {
		it("catches errors and calls handleError", async () => {
			const error = new Error("network error");
			mockKnowledgeList.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "knowledge", "list"]);

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});
});
