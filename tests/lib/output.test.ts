import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We need to mock commander's Command type for testing
function makeCmd(opts: Record<string, unknown> = {}): import("commander").Command {
	return {
		optsWithGlobals: () => opts,
	} as unknown as import("commander").Command;
}

describe("output module", () => {
	let stdoutWrite: ReturnType<typeof vi.spyOn>;
	let stderrWrite: ReturnType<typeof vi.spyOn>;
	let originalIsTTY: boolean | undefined;
	let originalColumns: number | undefined;

	beforeEach(() => {
		stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		originalIsTTY = process.stdout.isTTY;
		originalColumns = process.stdout.columns;
	});

	afterEach(() => {
		Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, writable: true, configurable: true });
		Object.defineProperty(process.stdout, "columns", { value: originalColumns, writable: true, configurable: true });
	});

	describe("getOutputFormat", () => {
		it("returns 'json' when globals.output === 'json'", async () => {
			const { getOutputFormat } = await import("../../src/lib/output.js");
			const cmd = makeCmd({ output: "json" });
			expect(getOutputFormat(cmd)).toBe("json");
		});

		it("returns 'table' when globals.output === 'table'", async () => {
			const { getOutputFormat } = await import("../../src/lib/output.js");
			const cmd = makeCmd({ output: "table" });
			expect(getOutputFormat(cmd)).toBe("table");
		});

		it("returns 'table' when isTTY is true and no explicit format", async () => {
			const { getOutputFormat } = await import("../../src/lib/output.js");
			Object.defineProperty(process.stdout, "isTTY", { value: true, writable: true, configurable: true });
			const cmd = makeCmd({});
			expect(getOutputFormat(cmd)).toBe("table");
		});

		it("returns 'json' when isTTY is false and no explicit format", async () => {
			const { getOutputFormat } = await import("../../src/lib/output.js");
			Object.defineProperty(process.stdout, "isTTY", { value: false, writable: true, configurable: true });
			const cmd = makeCmd({});
			expect(getOutputFormat(cmd)).toBe("json");
		});
	});

	describe("outputList", () => {
		it("in JSON mode writes valid JSON with { data: [...] } envelope to stdout", async () => {
			const { outputList } = await import("../../src/lib/output.js");
			const cmd = makeCmd({ output: "json" });
			const data = [{ name: "agent-1", id: "123" }];
			outputList(cmd, data, { columns: ["Name", "ID"], keys: ["name", "id"] });
			const written = stdoutWrite.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed).toHaveProperty("data");
			expect(parsed.data).toEqual(data);
		});

		it("in table mode writes cli-table3 formatted output to stdout", async () => {
			const { outputList } = await import("../../src/lib/output.js");
			Object.defineProperty(process.stdout, "isTTY", { value: true, writable: true, configurable: true });
			const cmd = makeCmd({ output: "table" });
			const data = [{ name: "agent-1", id: "123" }];
			outputList(cmd, data, { columns: ["Name", "ID"], keys: ["name", "id"] });
			const written = stdoutWrite.mock.calls.map((c) => c[0]).join("");
			// cli-table3 output contains box-drawing chars or pipes
			expect(written).toContain("agent-1");
			expect(written).toContain("123");
		});
	});

	describe("outputDetail", () => {
		it("in JSON mode writes single object as valid JSON to stdout", async () => {
			const { outputDetail } = await import("../../src/lib/output.js");
			const cmd = makeCmd({ output: "json" });
			const data = { name: "agent-1", id: "123" };
			outputDetail(cmd, data, { labels: ["Name", "ID"], keys: ["name", "id"] });
			const written = stdoutWrite.mock.calls.map((c) => c[0]).join("");
			const parsed = JSON.parse(written);
			expect(parsed).toEqual(data);
		});

		it("in table mode writes key-value pairs to stdout", async () => {
			const { outputDetail } = await import("../../src/lib/output.js");
			Object.defineProperty(process.stdout, "isTTY", { value: true, writable: true, configurable: true });
			const cmd = makeCmd({ output: "table" });
			const data = { name: "agent-1", id: "123" };
			outputDetail(cmd, data, { labels: ["Name", "ID"], keys: ["name", "id"] });
			const written = stdoutWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Name");
			expect(written).toContain("agent-1");
		});
	});

	describe("printJson", () => {
		it("writes JSON.stringify(data, null, 2) to stdout", async () => {
			const { printJson } = await import("../../src/lib/output.js");
			const data = { foo: "bar" };
			printJson(data);
			const written = stdoutWrite.mock.calls.map((c) => c[0]).join("");
			expect(written.trim()).toBe(JSON.stringify(data, null, 2));
		});
	});

	describe("writeError", () => {
		it("writes to stderr with 'Error: ' prefix", async () => {
			const { writeError } = await import("../../src/lib/output.js");
			writeError("something went wrong");
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Error:");
			expect(written).toContain("something went wrong");
			// Must NOT write to stdout
			expect(stdoutWrite).not.toHaveBeenCalled();
		});
	});

	describe("writeSuccess", () => {
		it("writes to stderr (not stdout)", async () => {
			const { writeSuccess } = await import("../../src/lib/output.js");
			writeSuccess("done");
			expect(stderrWrite).toHaveBeenCalled();
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Success:");
			expect(written).toContain("done");
			expect(stdoutWrite).not.toHaveBeenCalled();
		});
	});

	describe("writeWarning", () => {
		it("writes to stderr (not stdout)", async () => {
			const { writeWarning } = await import("../../src/lib/output.js");
			writeWarning("careful");
			expect(stderrWrite).toHaveBeenCalled();
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Warning:");
			expect(written).toContain("careful");
			expect(stdoutWrite).not.toHaveBeenCalled();
		});
	});

	describe("writeVerbose", () => {
		it("writes to stderr when verbose=true in globals", async () => {
			const { writeVerbose } = await import("../../src/lib/output.js");
			const cmd = makeCmd({ verbose: true });
			writeVerbose(cmd, "GET", "https://api.example.com/agents", 200, 150);
			expect(stderrWrite).toHaveBeenCalled();
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("GET");
			expect(written).toContain("https://api.example.com/agents");
			expect(written).toContain("200");
			expect(written).toContain("150");
		});

		it("is silent when verbose=false", async () => {
			const { writeVerbose } = await import("../../src/lib/output.js");
			const cmd = makeCmd({ verbose: false });
			writeVerbose(cmd, "GET", "https://api.example.com/agents");
			expect(stderrWrite).not.toHaveBeenCalled();
		});
	});

	describe("maskKey", () => {
		it('masks "sk-abc123def456" to show first 3 + last 4 chars', async () => {
			const { maskKey } = await import("../../src/lib/output.js");
			expect(maskKey("sk-abc123def456")).toBe("sk-...f456");
		});

		it('returns "(not set)" for undefined', async () => {
			const { maskKey } = await import("../../src/lib/output.js");
			expect(maskKey(undefined)).toBe("(not set)");
		});

		it('returns "(not set)" for null', async () => {
			const { maskKey } = await import("../../src/lib/output.js");
			expect(maskKey(null)).toBe("(not set)");
		});

		it('returns "(not set)" for empty string', async () => {
			const { maskKey } = await import("../../src/lib/output.js");
			expect(maskKey("")).toBe("(not set)");
		});
	});

	describe("handleNoColorFlag", () => {
		it("sets NO_COLOR env var when color=false", async () => {
			const { handleNoColorFlag } = await import("../../src/lib/output.js");
			const originalNoColor = process.env.NO_COLOR;
			const cmd = makeCmd({ color: false });
			handleNoColorFlag(cmd);
			expect(process.env.NO_COLOR).toBe("1");
			// Cleanup
			if (originalNoColor === undefined) {
				delete process.env.NO_COLOR;
			} else {
				process.env.NO_COLOR = originalNoColor;
			}
		});
	});
});
