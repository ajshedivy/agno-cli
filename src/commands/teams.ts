import type { AgentStream } from "@worksofadam/agentos-sdk";
import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputDetail, outputList, writeSuccess } from "../lib/output.js";
import { handleNonStreamRun, handleStreamRun } from "../lib/stream.js";

export const teamCommand = new Command("team").description("Manage teams");

teamCommand
	.command("list")
	.description("List all teams")
	.option("--limit <n>", "Results per page", (v: string) => Number.parseInt(v, 10), 20)
	.option("--page <n>", "Page number", (v: string) => Number.parseInt(v, 10), 1)
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

teamCommand
	.command("run")
	.argument("<team_id>", "Team ID")
	.argument("<message>", "Message to send to the team")
	.description("Run a team with a message")
	.option("-s, --stream", "Stream the response via SSE")
	.option("--session-id <id>", "Session ID for conversation context")
	.option("--user-id <id>", "User ID for personalization")
	.action(async (teamId: string, message: string, options, cmd) => {
		try {
			const client = getClient(cmd);
			if (options.stream) {
				const stream = await client.teams.runStream(teamId, {
					message,
					sessionId: options.sessionId,
					userId: options.userId,
				});
				await handleStreamRun(cmd, stream, "team");
			} else {
				await handleNonStreamRun(cmd, () =>
					client.teams.run(teamId, {
						message,
						sessionId: options.sessionId,
						userId: options.userId,
					}),
				);
			}
		} catch (err) {
			handleError(err);
		}
	});

teamCommand
	.command("continue")
	.argument("<team_id>", "Team ID")
	.argument("<run_id>", "Run ID to continue")
	.argument("<message>", "Message to continue with")
	.description("Continue a team run")
	.option("-s, --stream", "Stream the response via SSE")
	.option("--session-id <id>", "Session ID")
	.option("--user-id <id>", "User ID")
	.action(async (teamId: string, runId: string, message: string, options, cmd) => {
		try {
			const client = getClient(cmd);
			if (options.stream) {
				const stream = await client.teams.continue(teamId, runId, {
					tools: message,
					sessionId: options.sessionId,
					userId: options.userId,
					stream: true,
				});
				await handleStreamRun(cmd, stream as AgentStream, "team");
			} else {
				const result = await client.teams.continue(teamId, runId, {
					tools: message,
					sessionId: options.sessionId,
					userId: options.userId,
					stream: false,
				});
				const format = getOutputFormat(cmd);
				if (format === "json") {
					process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
				} else {
					const content = (result as Record<string, unknown>).content;
					if (content) {
						process.stdout.write(`${typeof content === "string" ? content : JSON.stringify(content, null, 2)}\n`);
					}
				}
			}
		} catch (err) {
			handleError(err);
		}
	});

teamCommand
	.command("cancel")
	.argument("<team_id>", "Team ID")
	.argument("<run_id>", "Run ID to cancel")
	.description("Cancel an in-progress team run")
	.action(async (teamId: string, runId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			await client.teams.cancel(teamId, runId);
			writeSuccess(`Cancelled run ${runId} for team ${teamId}`);
		} catch (err) {
			handleError(err);
		}
	});
