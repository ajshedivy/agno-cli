import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetConfig = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
	getBaseUrl: vi.fn(() => "http://localhost:8000"),
	getClient: vi.fn(() => ({ getConfig: mockGetConfig })),
}));

const mockOutputDetail = vi.fn();
const mockOutputList = vi.fn();
const mockPrintJson = vi.fn();
vi.mock("../../src/lib/output.js", () => ({
	getOutputFormat: vi.fn(() => "table"),
	outputDetail: (...args: unknown[]) => mockOutputDetail(...args),
	outputList: (...args: unknown[]) => mockOutputList(...args),
	printJson: (...args: unknown[]) => mockPrintJson(...args),
	writeError: vi.fn(),
	writeSuccess: vi.fn(),
}));

const mockHandleError = vi.fn();
vi.mock("../../src/lib/errors.js", () => ({
	handleError: (...args: unknown[]) => mockHandleError(...args),
}));

import { statusCommand } from "../../src/commands/status.js";
import { getOutputFormat } from "../../src/lib/output.js";

function createProgram(): Command {
	const program = new Command("agno");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(statusCommand);
	program.exitOverride();
	return program;
}

describe("status command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getOutputFormat).mockReturnValue("table");
	});

	it("renders OS identity block with name and description but without resource counts", async () => {
		mockGetConfig.mockResolvedValue({
			os_id: "os-123",
			name: "Test OS",
			description: "A test instance",
			databases: ["db1", "db2"],
			agents: [],
			teams: [],
			workflows: [],
		});

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		expect(mockGetConfig).toHaveBeenCalled();
		expect(mockOutputDetail).toHaveBeenCalled();
		const identityCall = mockOutputDetail.mock.calls[0];
		const identityData = identityCall[1] as Record<string, unknown>;
		const identityOpts = identityCall[2] as { labels: string[]; keys: string[] };
		expect(identityData).toEqual({
			os_id: "os-123",
			name: "Test OS",
			description: "A test instance",
		});
		expect(identityOpts.labels).toEqual(["OS ID", "Name", "Description"]);
		expect(identityOpts.keys).toEqual(["os_id", "name", "description"]);
		// counts must NOT appear in the identity block
		expect(identityData).not.toHaveProperty("agents");
		expect(identityData).not.toHaveProperty("teams");
		expect(identityData).not.toHaveProperty("workflows");
		expect(identityData).not.toHaveProperty("databases");
	});

	it("omits Name and Description when API returns null for those fields", async () => {
		mockGetConfig.mockResolvedValue({
			os_id: "os-456",
			name: null,
			description: null,
			databases: [],
			agents: [],
			teams: [],
			workflows: [],
		});

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		const identityCall = mockOutputDetail.mock.calls[0];
		const labels = (identityCall[2] as { labels: string[] }).labels;
		const keys = (identityCall[2] as { keys: string[] }).keys;
		expect(labels).not.toContain("Name");
		expect(labels).not.toContain("Description");
		expect(keys).not.toContain("name");
		expect(keys).not.toContain("description");
		expect(labels).toContain("OS ID");
	});

	it("outputs raw JSON passthrough including chat.quick_prompts when format is json", async () => {
		const configData = {
			os_id: "os-456",
			name: "JSON OS",
			description: "JSON test",
			databases: ["agentos-db"],
			chat: { quick_prompts: { agent1: ["hello", "world"] } },
			agents: [{ id: "a1", name: "A1", db_id: "agentos-db" }],
			teams: [],
			workflows: [],
		};
		mockGetConfig.mockResolvedValue(configData);
		vi.mocked(getOutputFormat).mockReturnValue("json");

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		expect(mockPrintJson).toHaveBeenCalledWith(configData);
		// raw passthrough contract: chat.quick_prompts must be preserved unchanged
		const passed = mockPrintJson.mock.calls[0][0] as Record<string, unknown>;
		expect(passed).toHaveProperty("chat");
		expect((passed.chat as { quick_prompts: unknown }).quick_prompts).toEqual({
			agent1: ["hello", "world"],
		});
		expect(mockOutputDetail).not.toHaveBeenCalled();
		expect(mockOutputList).not.toHaveBeenCalled();
	});

	it("calls handleError on failure", async () => {
		const error = new Error("connection failed");
		mockGetConfig.mockRejectedValue(error);

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		expect(mockHandleError).toHaveBeenCalledWith(error, expect.anything());
	});

	it("renders agents/teams/workflows sections via outputList with db_id column", async () => {
		mockGetConfig.mockResolvedValue({
			os_id: "os-1",
			databases: ["agentos-db", "agno-storage"],
			agents: [
				{
					id: "agent-1",
					name: "Agent One",
					description: "First agent",
					db_id: "agno-storage",
				},
			],
			teams: [
				{
					id: "team-1",
					name: "Team One",
					mode: "coordinate",
					description: "First team",
					db_id: "agentos-db",
				},
			],
			workflows: [
				{
					id: "wf-1",
					name: "Workflow One",
					description: "First workflow",
					db_id: "agentos-db",
				},
			],
		});

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		const listCalls = mockOutputList.mock.calls;
		expect(listCalls.length).toBe(3);

		const [agentsCall, teamsCall, workflowsCall] = listCalls;

		expect(agentsCall[1]).toEqual([
			{
				id: "agent-1",
				name: "Agent One",
				db_id: "agno-storage",
				description: "First agent",
			},
		]);
		expect(agentsCall[2]).toEqual({
			columns: ["ID", "NAME", "DB", "DESCRIPTION"],
			keys: ["id", "name", "db_id", "description"],
		});

		expect(teamsCall[1]).toEqual([
			{
				id: "team-1",
				name: "Team One",
				mode: "coordinate",
				db_id: "agentos-db",
				description: "First team",
			},
		]);
		expect(teamsCall[2]).toEqual({
			columns: ["ID", "NAME", "MODE", "DB", "DESCRIPTION"],
			keys: ["id", "name", "mode", "db_id", "description"],
		});

		expect(workflowsCall[1]).toEqual([
			{
				id: "wf-1",
				name: "Workflow One",
				db_id: "agentos-db",
				description: "First workflow",
			},
		]);
		expect(workflowsCall[2]).toEqual({
			columns: ["ID", "NAME", "DB", "DESCRIPTION"],
			keys: ["id", "name", "db_id", "description"],
		});
	});

	it("skips empty agent/team/workflow sections instead of printing 'No items found'", async () => {
		mockGetConfig.mockResolvedValue({
			os_id: "os-1",
			databases: ["agentos-db"],
			agents: [],
			teams: [],
			workflows: [],
		});

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		expect(mockOutputList).not.toHaveBeenCalled();
	});

	it("skips knowledge and interfaces sections when missing", async () => {
		mockGetConfig.mockResolvedValue({
			os_id: "os-1",
			databases: ["agentos-db"],
			agents: [{ id: "a1", name: "A1", description: "x", db_id: "agentos-db" }],
		});

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		// only the agents list call, no knowledge/interfaces
		expect(mockOutputList).toHaveBeenCalledTimes(1);
		const call = mockOutputList.mock.calls[0];
		expect(call[2].columns).toContain("ID");
		expect(call[2].columns).toContain("NAME");
	});

	it("renders knowledge instances when knowledge_instances is present", async () => {
		mockGetConfig.mockResolvedValue({
			os_id: "os-1",
			knowledge: {
				dbs: [{ db_id: "agentos-db" }],
				knowledge_instances: [
					{
						id: "k1",
						name: "K One",
						db_id: "agentos-db",
						table: "k_contents",
					},
				],
			},
		});

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		const knowledgeCall = mockOutputList.mock.calls.find((c) =>
			(c[2] as { columns: string[] }).columns.includes("TABLE"),
		);
		expect(knowledgeCall).toBeDefined();
		expect(knowledgeCall?.[1]).toEqual([{ id: "k1", name: "K One", db_id: "agentos-db", table: "k_contents" }]);
	});

	it("renders interfaces section when interfaces are present", async () => {
		mockGetConfig.mockResolvedValue({
			os_id: "os-1",
			interfaces: [{ type: "a2a", version: "1.0", route: "/a2a" }],
		});

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		const interfacesCall = mockOutputList.mock.calls.find((c) =>
			(c[2] as { columns: string[] }).columns.includes("ROUTE"),
		);
		expect(interfacesCall).toBeDefined();
		expect(interfacesCall?.[1]).toEqual([{ type: "a2a", version: "1.0", route: "/a2a" }]);
	});

	it("truncates long descriptions to 80 chars with ellipsis", async () => {
		const longDesc = "x".repeat(200);
		mockGetConfig.mockResolvedValue({
			os_id: "os-1",
			agents: [{ id: "a1", name: "A1", description: longDesc, db_id: "db" }],
		});

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		const agentRow = (mockOutputList.mock.calls[0][1] as Array<Record<string, string>>)[0];
		expect(agentRow.description.length).toBeLessThanOrEqual(80);
		expect(agentRow.description.endsWith("…")).toBe(true);
	});

	it("renders STORAGE section joining db_ids with comma when domain.dbs is present", async () => {
		mockGetConfig.mockResolvedValue({
			os_id: "os-1",
			session: { dbs: [{ db_id: "agno-storage" }, { db_id: "agentos-db" }] },
			evals: { dbs: [{ db_id: "agentos-db" }] },
		});

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		// outputDetail called twice: once for OS identity, once for STORAGE
		expect(mockOutputDetail).toHaveBeenCalledTimes(2);
		const storageCall = mockOutputDetail.mock.calls[1];
		const storageData = storageCall[1] as Record<string, string>;
		const storageOpts = storageCall[2] as { labels: string[]; keys: string[] };
		expect(storageData.sessions).toBe("agno-storage, agentos-db");
		expect(storageData.evals).toBe("agentos-db");
		expect(storageOpts.labels).toEqual(["Sessions", "Evals"]);
		expect(storageOpts.keys).toEqual(["sessions", "evals"]);
	});

	it("marks os_database as primary in DATABASES section", async () => {
		const writes: string[] = [];
		const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
			writes.push(typeof chunk === "string" ? chunk : chunk.toString());
			return true;
		});

		try {
			mockGetConfig.mockResolvedValue({
				os_id: "os-1",
				os_database: "agentos-db",
				databases: ["agentos-db", "agno-storage"],
			});

			const program = createProgram();
			await program.parseAsync(["node", "agno", "status"]);

			const written = writes.join("");
			expect(written).toContain("agentos-db");
			expect(written).toContain("agno-storage");
			expect(written).toContain("(primary)");
		} finally {
			writeSpy.mockRestore();
		}
	});
});
