import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs
const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockStatSync = vi.fn();

vi.mock("node:fs", () => ({
	existsSync: (...args: unknown[]) => mockExistsSync(...args),
	mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
	readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
	writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
	unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
	readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
	statSync: (...args: unknown[]) => mockStatSync(...args),
}));

// Mock config to use a test directory
vi.mock("../../src/lib/config.js", () => ({
	AGNO_CONFIG_DIR: "/tmp/test-agno",
}));

import type { PausedRunState } from "../../src/lib/paused-runs.js";
import {
	cleanStalePausedRuns,
	deletePausedRun,
	readPausedRun,
	writePausedRun,
} from "../../src/lib/paused-runs.js";

const CACHE_DIR = "/tmp/test-agno/paused-runs";

describe("paused-runs cache module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const sampleState: PausedRunState = {
		agent_id: "agent-123",
		run_id: "run-456",
		session_id: "sess-789",
		resource_type: "agent",
		paused_at: "2026-04-11T12:00:00.000Z",
		tools: [
			{
				tool_call_id: "tc-1",
				tool_name: "execute_sql",
				tool_args: { query: "SELECT * FROM users" },
			},
		],
	};

	describe("writePausedRun", () => {
		it("creates cache directory with mode 0o700 if it does not exist", () => {
			writePausedRun(sampleState);

			expect(mockMkdirSync).toHaveBeenCalledWith(CACHE_DIR, {
				recursive: true,
				mode: 0o700,
			});
		});

		it("writes JSON to ~/.agno/paused-runs/{run_id}.json with mode 0o600", () => {
			writePausedRun(sampleState);

			expect(mockWriteFileSync).toHaveBeenCalledWith(
				`${CACHE_DIR}/run-456.json`,
				JSON.stringify(sampleState, null, 2),
				{ mode: 0o600 },
			);
		});
	});

	describe("readPausedRun", () => {
		it("returns parsed PausedRunState for existing run_id", () => {
			// cleanStalePausedRuns side effect: directory exists
			mockExistsSync.mockImplementation((path: string) => {
				if (path === CACHE_DIR) return true;
				if (path === `${CACHE_DIR}/run-456.json`) return true;
				return false;
			});
			// cleanStalePausedRuns: no stale files
			mockReaddirSync.mockReturnValue([]);
			mockReadFileSync.mockReturnValue(JSON.stringify(sampleState));

			const result = readPausedRun("run-456");

			expect(result).toEqual(sampleState);
		});

		it("returns null for nonexistent run_id", () => {
			mockExistsSync.mockImplementation((path: string) => {
				if (path === CACHE_DIR) return true;
				return false;
			});
			mockReaddirSync.mockReturnValue([]);

			const result = readPausedRun("nonexistent");

			expect(result).toBeNull();
		});
	});

	describe("deletePausedRun", () => {
		it("removes the cache file for run_id", () => {
			mockExistsSync.mockReturnValue(true);

			deletePausedRun("run-456");

			expect(mockUnlinkSync).toHaveBeenCalledWith(`${CACHE_DIR}/run-456.json`);
		});

		it("does not throw for nonexistent run_id", () => {
			mockExistsSync.mockReturnValue(false);

			expect(() => deletePausedRun("nonexistent")).not.toThrow();
			expect(mockUnlinkSync).not.toHaveBeenCalled();
		});
	});

	describe("cleanStalePausedRuns", () => {
		it("deletes files older than 24 hours", () => {
			mockExistsSync.mockReturnValue(true);
			mockReaddirSync.mockReturnValue(["old-run.json"]);
			mockStatSync.mockReturnValue({
				mtimeMs: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
			});

			cleanStalePausedRuns();

			expect(mockUnlinkSync).toHaveBeenCalledWith(`${CACHE_DIR}/old-run.json`);
		});

		it("does not delete files younger than 24 hours", () => {
			mockExistsSync.mockReturnValue(true);
			mockReaddirSync.mockReturnValue(["fresh-run.json"]);
			mockStatSync.mockReturnValue({
				mtimeMs: Date.now(), // Just now
			});

			cleanStalePausedRuns();

			expect(mockUnlinkSync).not.toHaveBeenCalled();
		});

		it("does not throw when cache directory does not exist", () => {
			mockExistsSync.mockReturnValue(false);

			expect(() => cleanStalePausedRuns()).not.toThrow();
			expect(mockReaddirSync).not.toHaveBeenCalled();
		});

		it("handles mixed stale and fresh files correctly", () => {
			mockExistsSync.mockReturnValue(true);
			mockReaddirSync.mockReturnValue(["stale.json", "fresh.json"]);
			mockStatSync.mockImplementation((path: string) => {
				if (path.includes("stale.json")) {
					return { mtimeMs: Date.now() - 25 * 60 * 60 * 1000 };
				}
				return { mtimeMs: Date.now() };
			});

			cleanStalePausedRuns();

			expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
			expect(mockUnlinkSync).toHaveBeenCalledWith(`${CACHE_DIR}/stale.json`);
		});
	});
});
