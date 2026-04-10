import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputDetail, outputList, printJson, writeSuccess } from "../lib/output.js";

export const memoryCommand = new Command("memory").description("Manage memories");

// ── memory list ─────────────────────────────────────────────────────────

memoryCommand
	.command("list")
	.description("List memories")
	.option("--user-id <id>", "Filter by user ID")
	.option("--team-id <id>", "Filter by team ID")
	.option("--agent-id <id>", "Filter by agent ID")
	.option("--search <content>", "Search within memory content")
	.option("--topics <topics>", "Comma-separated topics to filter by")
	.option("--limit <n>", "Results per page", (v: string) => Number.parseInt(v, 10), 20)
	.option("--page <n>", "Page number", (v: string) => Number.parseInt(v, 10), 1)
	.option("--sort-by <field>", "Sort field")
	.option("--sort-order <order>", "Sort order (asc, desc)")
	.option("--db-id <id>", "Database ID")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const parsedTopics = opts.topics ? (opts.topics as string).split(",").map((t: string) => t.trim()) : undefined;

			const client = getClient(cmd);
			const result = await client.memories.list({
				userId: opts.userId,
				teamId: opts.teamId,
				agentId: opts.agentId,
				searchContent: opts.search,
				topics: parsedTopics,
				page: opts.page,
				limit: opts.limit,
				sortBy: opts.sortBy,
				sortOrder: opts.sortOrder,
				dbId: opts.dbId,
			});

			const data = (result as Record<string, unknown>).data as Record<string, unknown>[];
			const meta = (result as Record<string, unknown>).meta as
				| { page: number; limit: number; total_pages: number; total_count: number }
				| undefined;

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson({ data, meta });
				return;
			}

			outputList(
				cmd,
				data.map((m) => ({
					memory_id: (m as Record<string, unknown>).memory_id ?? "",
					memory: (m as Record<string, unknown>).memory ?? "",
					topics: Array.isArray((m as Record<string, unknown>).topics)
						? ((m as Record<string, unknown>).topics as string[]).join(", ")
						: "",
					user_id: (m as Record<string, unknown>).user_id ?? "",
				})),
				{
					columns: ["ID", "MEMORY", "TOPICS", "USER_ID"],
					keys: ["memory_id", "memory", "topics", "user_id"],
					meta,
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

// ── memory get ──────────────────────────────────────────────────────────

memoryCommand
	.command("get")
	.argument("<memory_id>", "Memory ID")
	.description("Get memory details")
	.option("--db-id <id>", "Database ID")
	.action(async (memoryId: string, _options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const memory = await client.memories.get(memoryId, { dbId: opts.dbId });

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(memory);
				return;
			}

			const m = memory as Record<string, unknown>;
			outputDetail(
				cmd,
				{
					memory_id: m.memory_id ?? "",
					memory: m.memory ?? "",
					topics: Array.isArray(m.topics) ? (m.topics as string[]).join(", ") : "",
					agent_id: m.agent_id ?? "",
					team_id: m.team_id ?? "",
					user_id: m.user_id ?? "",
					updated_at: m.updated_at ?? "",
				},
				{
					labels: ["Memory ID", "Memory", "Topics", "Agent ID", "Team ID", "User ID", "Updated At"],
					keys: ["memory_id", "memory", "topics", "agent_id", "team_id", "user_id", "updated_at"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

// ── memory create ───────────────────────────────────────────────────────

memoryCommand
	.command("create")
	.description("Create a new memory")
	.requiredOption("--memory <content>", "Memory content")
	.option("--topics <topics>", "Comma-separated topics")
	.option("--user-id <id>", "User ID")
	.option("--db-id <id>", "Database ID")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const parsedTopics = opts.topics ? (opts.topics as string).split(",").map((t: string) => t.trim()) : undefined;

			const client = getClient(cmd);
			const memory = await client.memories.create({
				memory: opts.memory,
				topics: parsedTopics,
				userId: opts.userId,
				dbId: opts.dbId,
			});

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(memory);
				return;
			}

			const m = memory as Record<string, unknown>;
			outputDetail(
				cmd,
				{
					memory_id: m.memory_id ?? "",
					memory: m.memory ?? "",
					topics: Array.isArray(m.topics) ? (m.topics as string[]).join(", ") : "",
					user_id: m.user_id ?? "",
				},
				{
					labels: ["Memory ID", "Memory", "Topics", "User ID"],
					keys: ["memory_id", "memory", "topics", "user_id"],
				},
			);
			writeSuccess("Memory created.");
		} catch (err) {
			handleError(err);
		}
	});

// ── memory update ───────────────────────────────────────────────────────

memoryCommand
	.command("update")
	.argument("<memory_id>", "Memory ID")
	.description("Update a memory")
	.option("--memory <content>", "New memory content")
	.option("--topics <topics>", "Comma-separated topics")
	.option("--db-id <id>", "Database ID")
	.action(async (memoryId: string, _options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const parsedTopics = opts.topics ? (opts.topics as string).split(",").map((t: string) => t.trim()) : undefined;

			const client = getClient(cmd);
			await client.memories.update(memoryId, {
				memory: opts.memory,
				topics: parsedTopics,
				dbId: opts.dbId,
			});

			writeSuccess("Memory updated.");
		} catch (err) {
			handleError(err);
		}
	});

// ── memory delete ───────────────────────────────────────────────────────

memoryCommand
	.command("delete")
	.argument("<memory_id>", "Memory ID")
	.description("Delete a memory")
	.option("--db-id <id>", "Database ID")
	.action(async (memoryId: string, _options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			await client.memories.delete(memoryId, { dbId: opts.dbId });
			writeSuccess("Memory deleted.");
		} catch (err) {
			handleError(err);
		}
	});

// ── memory delete-all ───────────────────────────────────────────────────

memoryCommand
	.command("delete-all")
	.description("Delete multiple memories")
	.requiredOption("--ids <ids>", "Comma-separated memory IDs")
	.option("--user-id <id>", "User ID")
	.option("--db-id <id>", "Database ID")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const memoryIds = (opts.ids as string).split(",").map((s: string) => s.trim());

			const client = getClient(cmd);
			await client.memories.deleteAll({
				memoryIds,
				userId: opts.userId,
				dbId: opts.dbId,
			});
			writeSuccess("Memories deleted.");
		} catch (err) {
			handleError(err);
		}
	});

// ── memory topics ───────────────────────────────────────────────────────

memoryCommand
	.command("topics")
	.description("List memory topics")
	.option("--user-id <id>", "Filter by user ID")
	.option("--db-id <id>", "Database ID")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.memories.getTopics({
				userId: opts.userId,
				dbId: opts.dbId,
			});

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			// Topics response may vary; render as JSON for table mode too if not array
			if (Array.isArray(result)) {
				outputList(
					cmd,
					result.map((t) => ({ topic: String(t) })),
					{
						columns: ["TOPIC"],
						keys: ["topic"],
					},
				);
			} else {
				printJson(result);
			}
		} catch (err) {
			handleError(err);
		}
	});

// ── memory stats ────────────────────────────────────────────────────────

memoryCommand
	.command("stats")
	.description("Get memory statistics")
	.option("--user-id <id>", "Filter by user ID")
	.option("--limit <n>", "Results per page", (v: string) => Number.parseInt(v, 10))
	.option("--page <n>", "Page number", (v: string) => Number.parseInt(v, 10))
	.option("--db-id <id>", "Database ID")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.memories.getStats({
				userId: opts.userId,
				limit: opts.limit,
				page: opts.page,
				dbId: opts.dbId,
			});

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			// Stats response may vary; render as JSON for table mode if not array
			if (Array.isArray(result)) {
				outputList(
					cmd,
					result.map((s) => {
						const stat = s as Record<string, unknown>;
						return {
							user_id: stat.user_id ?? "",
							total_memories: stat.total_memories ?? "",
							last_updated: stat.last_updated ?? "",
						};
					}),
					{
						columns: ["USER_ID", "TOTAL_MEMORIES", "LAST_UPDATED"],
						keys: ["user_id", "total_memories", "last_updated"],
					},
				);
			} else {
				printJson(result);
			}
		} catch (err) {
			handleError(err);
		}
	});

// ── memory optimize ─────────────────────────────────────────────────────

memoryCommand
	.command("optimize")
	.description("Optimize memories for a user")
	.requiredOption("--user-id <id>", "User ID (required)")
	.option("--model <model>", "Model to use for optimization")
	.option("--apply", "Apply optimizations immediately")
	.option("--db-id <id>", "Database ID")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.memories.optimize({
				userId: opts.userId,
				model: opts.model,
				apply: opts.apply,
				dbId: opts.dbId,
			});

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			writeSuccess(`Memory optimization ${opts.apply ? "applied" : "previewed"}.`);
			printJson(result);
		} catch (err) {
			handleError(err);
		}
	});
