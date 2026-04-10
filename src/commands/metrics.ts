import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputList, printJson, writeSuccess } from "../lib/output.js";

export const metricsCommand = new Command("metrics").description("View and refresh metrics");

metricsCommand
	.command("get")
	.description("Get aggregated metrics")
	.option("--start-date <date>", "Start date (YYYY-MM-DD)")
	.option("--end-date <date>", "End date (YYYY-MM-DD)")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const response = await client.metrics.get({
				startingDate: opts.startDate as string | undefined,
				endingDate: opts.endDate as string | undefined,
			});

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(response);
				return;
			}

			const metrics = response.metrics ?? [];
			outputList(
				cmd,
				metrics.map((m) => ({
					date: m.date ?? "",
					agent_runs_count: m.agent_runs_count ?? 0,
					team_runs_count: m.team_runs_count ?? 0,
					workflow_runs_count: m.workflow_runs_count ?? 0,
					users_count: m.users_count ?? 0,
				})),
				{
					columns: ["DATE", "AGENT_RUNS", "TEAM_RUNS", "WORKFLOW_RUNS", "USERS"],
					keys: ["date", "agent_runs_count", "team_runs_count", "workflow_runs_count", "users_count"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

metricsCommand
	.command("refresh")
	.description("Trigger metrics refresh")
	.action(async (_options, cmd) => {
		try {
			const client = getClient(cmd);
			await client.metrics.refresh();
			writeSuccess("Metrics refresh triggered.");
		} catch (err) {
			handleError(err);
		}
	});
