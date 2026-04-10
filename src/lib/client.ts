// Client bridge module -- placeholder, implemented in Task 3
import type { AgentOSClient } from "@worksofadam/agentos-sdk";
import type { Command } from "commander";

let _client: AgentOSClient | null = null;

export function getClient(_cmd: Command): AgentOSClient {
	if (_client) return _client;
	throw new Error("Client module not yet implemented. See Task 3.");
}

export function resetClient(): void {
	_client = null;
}
