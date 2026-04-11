import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockModelsList = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
	getBaseUrl: vi.fn(() => "http://localhost:8000"),
	getClient: vi.fn(() => ({
		models: { list: mockModelsList },
	})),
}));

const mockOutputList = vi.fn();
vi.mock("../../src/lib/output.js", () => ({
	getOutputFormat: vi.fn(() => "table"),
	outputList: (...args: unknown[]) => mockOutputList(...args),
	outputDetail: vi.fn(),
	printJson: vi.fn(),
	writeError: vi.fn(),
	writeSuccess: vi.fn(),
}));

const mockHandleError = vi.fn();
vi.mock("../../src/lib/errors.js", () => ({
	handleError: (...args: unknown[]) => mockHandleError(...args),
}));

import { modelCommand } from "../../src/commands/models.js";

function createProgram(): Command {
	const program = new Command("agno");
	program.option("-o, --output <format>", "Output format", "table");
	program.option("--url <url>", "Override base URL");
	program.option("--key <key>", "Override security key");
	program.addCommand(modelCommand);
	program.exitOverride();
	return program;
}

describe("models command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("models list", () => {
		it("calls client.models.list and outputs ID, PROVIDER columns", async () => {
			mockModelsList.mockResolvedValue([
				{ id: "gpt-4", provider: "openai" },
				{ id: "claude-3", provider: "anthropic" },
			]);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "models", "list"]);

			expect(mockModelsList).toHaveBeenCalled();
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ id: "gpt-4", provider: "openai" }),
					expect.objectContaining({ id: "claude-3", provider: "anthropic" }),
				]),
				expect.objectContaining({
					columns: ["ID", "PROVIDER"],
					keys: ["id", "provider"],
					meta: expect.objectContaining({ total_count: 2 }),
				}),
			);
		});

		it("applies client-side pagination", async () => {
			const models = Array.from({ length: 8 }, (_, i) => ({
				id: `model-${i}`,
				provider: `provider-${i}`,
			}));
			mockModelsList.mockResolvedValue(models);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "models", "list", "--limit", "3", "--page", "2"]);

			const callArgs = mockOutputList.mock.calls[0];
			expect(callArgs[1]).toHaveLength(3);
			expect(callArgs[1][0]).toEqual(expect.objectContaining({ id: "model-3" }));
			expect(callArgs[2].meta).toEqual({
				page: 2,
				limit: 3,
				total_pages: 3,
				total_count: 8,
			});
		});

		it("handles error with handleError", async () => {
			const error = new Error("network error");
			mockModelsList.mockRejectedValue(error);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "models", "list"]);

			expect(mockHandleError).toHaveBeenCalledWith(error, expect.anything());
		});
	});
});
