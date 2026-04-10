import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputDetail, printJson } from "../lib/output.js";

export const statusCommand = new Command("status")
	.description("Show AgentOS server status and resource counts")
	.action(async (_options, cmd) => {
		try {
			const client = getClient(cmd);
			// SDK types getConfig() as OSConfig but the actual API returns ConfigResponse
			// with os_id, name, description, databases, agents[], teams[], workflows[]
			const config = (await client.getConfig()) as unknown as Record<string, unknown>;

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(config);
				return;
			}

			outputDetail(
				cmd,
				{
					os_id: config.os_id ?? "N/A",
					name: config.name ?? "N/A",
					description: config.description ?? "N/A",
					databases: Array.isArray(config.databases) ? config.databases.length : 0,
					agents: Array.isArray(config.agents) ? config.agents.length : 0,
					teams: Array.isArray(config.teams) ? config.teams.length : 0,
					workflows: Array.isArray(config.workflows) ? config.workflows.length : 0,
				},
				{
					labels: ["OS ID", "Name", "Description", "Databases", "Agents", "Teams", "Workflows"],
					keys: ["os_id", "name", "description", "databases", "agents", "teams", "workflows"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});
