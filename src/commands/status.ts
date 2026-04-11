import { Command } from "commander";
import { getBaseUrl, getClient } from "../lib/client.js";
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

			const display: Record<string, unknown> = {
				os_id: config.os_id ?? "unknown",
			};
			const labels: string[] = ["OS ID"];
			const keys: string[] = ["os_id"];

			if (config.name) {
				display.name = config.name;
				labels.push("Name");
				keys.push("name");
			}
			if (config.description) {
				display.description = config.description;
				labels.push("Description");
				keys.push("description");
			}

			// Always show resource counts
			display.databases = Array.isArray(config.databases) ? config.databases.length : 0;
			display.agents = Array.isArray(config.agents) ? config.agents.length : 0;
			display.teams = Array.isArray(config.teams) ? config.teams.length : 0;
			display.workflows = Array.isArray(config.workflows) ? config.workflows.length : 0;
			labels.push("Databases", "Agents", "Teams", "Workflows");
			keys.push("databases", "agents", "teams", "workflows");

			outputDetail(cmd, display, { labels, keys });
		} catch (err) {
			handleError(err, { url: getBaseUrl(cmd) });
		}
	});
