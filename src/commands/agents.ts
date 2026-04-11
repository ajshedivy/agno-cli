import type { AgentStream } from "@worksofadam/agentos-sdk";
import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputDetail, outputList, writeSuccess } from "../lib/output.js";
import { handleNonStreamRun, handleStreamRun } from "../lib/stream.js";

export const agentCommand = new Command("agent").description("Manage agents");

agentCommand
	.command("list")
	.description("List all agents")
	.option("--limit <n>", "Results per page", (v: string) => Number.parseInt(v, 10), 20)
	.option("--page <n>", "Page number", (v: string) => Number.parseInt(v, 10), 1)
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

agentCommand
	.command("run")
	.argument("<agent_id>", "Agent ID")
	.argument("<message>", "Message to send to the agent")
	.description("Run an agent with a message")
	.option("-s, --stream", "Stream the response via SSE")
	.option("--session-id <id>", "Session ID for conversation context")
	.option("--user-id <id>", "User ID for personalization")
	.action(async (agentId: string, message: string, options, cmd) => {
		try {
			const client = getClient(cmd);
			if (options.stream) {
				const stream = await client.agents.runStream(agentId, {
					message,
					sessionId: options.sessionId,
					userId: options.userId,
				});
				await handleStreamRun(cmd, stream, "agent");
			} else {
				await handleNonStreamRun(cmd, () =>
					client.agents.run(agentId, {
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

agentCommand
	.command("continue")
	.argument("<agent_id>", "Agent ID")
	.argument("<run_id>", "Run ID to continue")
	.argument("<message>", "Message to continue with")
	.description("Continue an agent run")
	.option("-s, --stream", "Stream the response via SSE")
	.option("--session-id <id>", "Session ID")
	.option("--user-id <id>", "User ID")
	.action(async (agentId: string, runId: string, message: string, options, cmd) => {
		try {
			const client = getClient(cmd);
			if (options.stream) {
				const stream = await client.agents.continue(agentId, runId, {
					tools: message,
					sessionId: options.sessionId,
					userId: options.userId,
					stream: true,
				});
				await handleStreamRun(cmd, stream as AgentStream, "agent");
			} else {
				const result = await client.agents.continue(agentId, runId, {
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

agentCommand
	.command("cancel")
	.argument("<agent_id>", "Agent ID")
	.argument("<run_id>", "Run ID to cancel")
	.description("Cancel an in-progress agent run")
	.action(async (agentId: string, runId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			await client.agents.cancel(agentId, runId);
			writeSuccess(`Cancelled run ${runId} for agent ${agentId}`);
		} catch (err) {
			handleError(err);
		}
	});
