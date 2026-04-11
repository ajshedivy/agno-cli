import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AGNO_CONFIG_DIR } from "./config.js";

// ── Constants ────────────────────────────────────────────────────────

const CACHE_DIR = join(AGNO_CONFIG_DIR, "paused-runs");
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Types ────────────────────────────────────────────────────────────

export interface PausedRunState {
	agent_id: string;
	run_id: string;
	session_id: string | null;
	resource_type: string;
	paused_at: string;
	tools: Array<{
		tool_call_id: string;
		tool_name: string;
		tool_args: Record<string, unknown>;
		requires_confirmation?: boolean;
		confirmed?: boolean | null;
		created_at?: number;
		[key: string]: unknown;
	}>;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Persist a paused run state to disk.
 * Creates the cache directory (0o700) if needed and writes JSON with 0o600 permissions.
 */
export function writePausedRun(state: PausedRunState): void {
	mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
	writeFileSync(join(CACHE_DIR, `${state.run_id}.json`), JSON.stringify(state, null, 2), { mode: 0o600 });
}

/**
 * Read a paused run state from the cache.
 * Cleans stale entries before reading. Returns null if not found.
 */
export function readPausedRun(runId: string): PausedRunState | null {
	cleanStalePausedRuns();
	const filePath = join(CACHE_DIR, `${runId}.json`);
	if (!existsSync(filePath)) return null;
	return JSON.parse(readFileSync(filePath, "utf-8")) as PausedRunState;
}

/**
 * Delete a paused run cache file. No-op if the file does not exist.
 */
export function deletePausedRun(runId: string): void {
	const filePath = join(CACHE_DIR, `${runId}.json`);
	if (!existsSync(filePath)) return;
	unlinkSync(filePath);
}

/**
 * Remove cache files older than 24 hours.
 * No-op if the cache directory does not exist.
 */
export function cleanStalePausedRuns(): void {
	if (!existsSync(CACHE_DIR)) return;
	const files = readdirSync(CACHE_DIR);
	const now = Date.now();
	for (const file of files) {
		const filePath = join(CACHE_DIR, file);
		const stat = statSync(filePath);
		if (now - stat.mtimeMs > MAX_AGE_MS) {
			unlinkSync(filePath);
		}
	}
}
