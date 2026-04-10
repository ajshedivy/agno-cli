import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputDetail, outputList } from "../lib/output.js";

export const teamCommand = new Command("team").description("Manage teams");

teamCommand
	.command("list")
	.description("List all teams")
	.option("--limit <n>", "Results per page", Number.parseInt, 20)
	.option("--page <n>", "Page number", Number.parseInt, 1)
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const teams = await client.teams.list();

			const limit = opts.limit as number;
			const page = opts.page as number;
			const start = (page - 1) * limit;
			const paged = teams.slice(start, start + limit);
			const meta = {
				page,
				limit,
				total_pages: Math.ceil(teams.length / limit),
				total_count: teams.length,
			};

			outputList(
				cmd,
				paged.map((t) => ({
					id: t.id ?? "",
					name: t.name ?? "",
					mode: t.mode ?? "",
					description: t.description ?? "",
				})),
				{
					columns: ["ID", "NAME", "MODE", "DESCRIPTION"],
					keys: ["id", "name", "mode", "description"],
					meta,
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

teamCommand
	.command("get")
	.argument("<team_id>", "Team ID")
	.description("Get team details")
	.action(async (teamId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			const team = await client.teams.get(teamId);

			const format = getOutputFormat(cmd);
			if (format === "json") {
				process.stdout.write(`${JSON.stringify(team, null, 2)}\n`);
				return;
			}

			const modelDisplay = team.model?.model ?? team.model?.name ?? "N/A";

			outputDetail(
				cmd,
				{
					id: team.id ?? "",
					name: team.name ?? "",
					mode: team.mode ?? "",
					description: team.description ?? "",
					model: modelDisplay,
				},
				{
					labels: ["ID", "Name", "Mode", "Description", "Model"],
					keys: ["id", "name", "mode", "description", "model"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});
