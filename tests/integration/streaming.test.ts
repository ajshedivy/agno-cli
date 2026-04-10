// Run with: INTEGRATION=1 npx vitest run tests/integration/streaming.test.ts
//
// Requires a running AgentOS server at localhost:8000 with at least one agent registered.
// Start the server with: ixora start

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCb);

const CLI_BIN = "./dist/bin/agno-os.js";
const SERVER_URL = "http://localhost:8000";

interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

async function runCli(...args: string[]): Promise<ExecResult> {
	try {
		const { stdout, stderr } = await execFile("node", [CLI_BIN, ...args], {
			timeout: 30_000,
			env: { ...process.env, NO_COLOR: "1" },
		});
		return { stdout, stderr, exitCode: 0 };
	} catch (err) {
		const e = err as { stdout?: string; stderr?: string; code?: number };
		return {
			stdout: e.stdout ?? "",
			stderr: e.stderr ?? "",
			exitCode: e.code ?? 1,
		};
	}
}

/**
 * Get the first available agent ID from the server.
 */
async function getFirstAgentId(): Promise<string | null> {
	const result = await runCli("agent", "list", "--output", "json", "--url", SERVER_URL);
	if (result.exitCode !== 0) return null;
	try {
		const parsed = JSON.parse(result.stdout);
		const agents = parsed.data ?? parsed;
		if (Array.isArray(agents) && agents.length > 0) {
			return agents[0].id ?? null;
		}
	} catch {
		// JSON parse failed
	}
	return null;
}

describe.skipIf(!process.env.INTEGRATION)("streaming integration tests", () => {
	let agentId: string | null = null;

	it("can connect to server and find an agent", async () => {
		agentId = await getFirstAgentId();
		expect(agentId).toBeTruthy();
	});

	it("agent run (non-streaming) returns content and metrics", async () => {
		if (!agentId) {
			agentId = await getFirstAgentId();
		}
		if (!agentId) {
			console.warn("Skipping: no agents available on server");
			return;
		}

		const result = await runCli("agent", "run", agentId, "say hello", "--url", SERVER_URL, "--output", "table");

		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim().length).toBeGreaterThan(0);
		// Metrics should appear on stderr
		expect(result.stderr).toMatch(/\[tokens:|time:/);
	});

	it("agent run (streaming) returns content", async () => {
		if (!agentId) {
			agentId = await getFirstAgentId();
		}
		if (!agentId) {
			console.warn("Skipping: no agents available on server");
			return;
		}

		const result = await runCli(
			"agent",
			"run",
			agentId,
			"say hello briefly",
			"--stream",
			"--url",
			SERVER_URL,
			"--output",
			"table",
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim().length).toBeGreaterThan(0);
	});

	it("agent run (json mode) returns valid JSON", async () => {
		if (!agentId) {
			agentId = await getFirstAgentId();
		}
		if (!agentId) {
			console.warn("Skipping: no agents available on server");
			return;
		}

		const result = await runCli("agent", "run", agentId, "say hello", "--url", SERVER_URL, "--output", "json");

		expect(result.exitCode).toBe(0);
		const parsed = JSON.parse(result.stdout);
		expect(parsed).toBeTruthy();
		// Non-streaming JSON mode returns the full result object
		expect(parsed.content !== undefined || parsed.run_id !== undefined).toBe(true);
	});

	it("agent cancel with invalid run ID returns error", async () => {
		if (!agentId) {
			agentId = await getFirstAgentId();
		}
		if (!agentId) {
			console.warn("Skipping: no agents available on server");
			return;
		}

		const result = await runCli("agent", "cancel", agentId, "invalid-run-id", "--url", SERVER_URL);

		// Expect non-zero exit (NotFound or similar)
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.length).toBeGreaterThan(0);
	});
});
