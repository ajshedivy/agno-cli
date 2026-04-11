import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetConfig = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
	getClient: vi.fn(() => ({ getConfig: mockGetConfig })),
}));

const mockOutputDetail = vi.fn();
const mockPrintJson = vi.fn();
vi.mock("../../src/lib/output.js", () => ({
	getOutputFormat: vi.fn(() => "table"),
	outputDetail: (...args: unknown[]) => mockOutputDetail(...args),
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
	});

	it("calls getConfig and outputs detail with OS info", async () => {
		mockGetConfig.mockResolvedValue({
			os_id: "os-123",
			name: "Test OS",
			description: "A test instance",
			databases: ["db1", "db2"],
			agents: [{ id: "a1" }],
			teams: [{ id: "t1" }, { id: "t2" }],
			workflows: [],
		});

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		expect(mockGetConfig).toHaveBeenCalled();
		expect(mockOutputDetail).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				os_id: "os-123",
				name: "Test OS",
				description: "A test instance",
				databases: 2,
				agents: 1,
				teams: 2,
				workflows: 0,
			}),
			expect.objectContaining({
				labels: expect.arrayContaining(["OS ID", "Name"]),
				keys: expect.arrayContaining(["os_id", "name"]),
			}),
		);
	});

	it("outputs JSON with printJson when format is json", async () => {
		const configData = {
			os_id: "os-456",
			name: "JSON OS",
			description: "JSON test",
			databases: [],
			agents: [],
			teams: [],
			workflows: [],
		};
		mockGetConfig.mockResolvedValue(configData);
		vi.mocked(getOutputFormat).mockReturnValue("json");

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		expect(mockPrintJson).toHaveBeenCalledWith(configData);
		expect(mockOutputDetail).not.toHaveBeenCalled();
	});

	it("calls handleError on failure", async () => {
		const error = new Error("connection failed");
		mockGetConfig.mockRejectedValue(error);

		const program = createProgram();
		await program.parseAsync(["node", "agno", "status"]);

		expect(mockHandleError).toHaveBeenCalledWith(error);
	});
});
