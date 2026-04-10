import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputDetail, outputList } from "../lib/output.js";

export const agentCommand = new Command("agent").description("Manage agents");

agentCommand
	.command("list")
	.description("List all agents")
	.option("--limit <n>", "Results per page", Number.parseInt, 20)
	.option("--page <n>", "Page number", Number.parseInt, 1)
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const agents = await client.agents.list();

			// Client-side pagination for non-paginated SDK resources
			const limit = opts.limit as number;
			const page = opts.page as number;
			const start = (page - 1) * limit;
			const paged = agents.slice(start, start + limit);
			const meta = {
				page,
				limit,
				total_pages: Math.ceil(agents.length / limit),
				total_count: agents.length,
			};

			outputList(
				cmd,
				paged.map((a) => ({
					id: a.id ?? "",
					name: a.name ?? "",
					description: a.description ?? "",
				})),
				{
					columns: ["ID", "NAME", "DESCRIPTION"],
					keys: ["id", "name", "description"],
					meta,
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

agentCommand
	.command("get")
	.argument("<agent_id>", "Agent ID")
	.description("Get agent details")
	.action(async (agentId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			const agent = await client.agents.get(agentId);

			const format = getOutputFormat(cmd);
			if (format === "json") {
				process.stdout.write(`${JSON.stringify(agent, null, 2)}\n`);
				return;
			}

			const modelDisplay = agent.model?.model ?? agent.model?.name ?? "N/A";

			outputDetail(
				cmd,
				{
					id: agent.id ?? "",
					name: agent.name ?? "",
					description: agent.description ?? "",
					model: modelDisplay,
				},
				{
					labels: ["ID", "Name", "Description", "Model"],
					keys: ["id", "name", "description", "model"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});
