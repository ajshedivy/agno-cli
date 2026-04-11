import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockModelsList = vi.fn();
vi.mock("../../src/lib/client.js", () => ({
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
		it("calls client.models.list and outputs NAME, MODEL, PROVIDER columns", async () => {
			mockModelsList.mockResolvedValue([
				{ name: "GPT-4", model: "gpt-4", provider: "OpenAI" },
				{ name: "Claude", model: "claude-3", provider: "Anthropic" },
			]);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "models", "list"]);

			expect(mockModelsList).toHaveBeenCalled();
			expect(mockOutputList).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ name: "GPT-4", model: "gpt-4", provider: "OpenAI" }),
					expect.objectContaining({ name: "Claude", model: "claude-3", provider: "Anthropic" }),
				]),
				expect.objectContaining({
					columns: ["NAME", "MODEL", "PROVIDER"],
					keys: ["name", "model", "provider"],
					meta: expect.objectContaining({ total_count: 2 }),
				}),
			);
		});

		it("applies client-side pagination", async () => {
			const models = Array.from({ length: 8 }, (_, i) => ({
				name: `Model ${i}`,
				model: `model-${i}`,
				provider: `Provider ${i}`,
			}));
			mockModelsList.mockResolvedValue(models);

			const program = createProgram();
			await program.parseAsync(["node", "agno", "models", "list", "--limit", "3", "--page", "2"]);

			const callArgs = mockOutputList.mock.calls[0];
			expect(callArgs[1]).toHaveLength(3);
			expect(callArgs[1][0]).toEqual(expect.objectContaining({ name: "Model 3" }));
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

			expect(mockHandleError).toHaveBeenCalledWith(error);
		});
	});
});
