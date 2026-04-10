import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputDetail, outputList, printJson, writeError, writeSuccess } from "../lib/output.js";

export const knowledgeCommand = new Command("knowledge").description("Manage knowledge base");

// -- knowledge upload --------------------------------------------------------

knowledgeCommand
	.command("upload")
	.argument("[file_path]", "Local file path to upload")
	.description("Upload content to knowledge base")
	.option("--url <url>", "Upload from URL instead of file")
	.option("--name <name>", "Content name")
	.option("--description <desc>", "Content description")
	.option("--db-id <id>", "Database ID")
	.action(async (filePath: string | undefined, _options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);

			if (!filePath && !opts.url) {
				writeError("Provide a file path or --url");
				process.exitCode = 1;
				return;
			}

			if (filePath && opts.url) {
				writeError("Provide either a file path or --url, not both");
				process.exitCode = 1;
				return;
			}

			const uploadOpts: Record<string, unknown> = {
				name: opts.name,
				description: opts.description,
				dbId: opts.dbId,
			};

			if (filePath) {
				const resolved = resolve(filePath);
				if (!existsSync(resolved)) {
					writeError(`File not found: ${resolved}`);
					process.exitCode = 1;
					return;
				}
				uploadOpts.file = resolved;
			} else {
				uploadOpts.url = opts.url;
			}

			const result = (await client.knowledge.upload(uploadOpts)) as Record<string, unknown>;

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
			} else {
				outputDetail(
					cmd,
					{
						id: result.id ?? "",
						name: result.name ?? "",
						status: result.status ?? "",
						type: result.type ?? "",
					},
					{
						labels: ["ID", "Name", "Status", "Type"],
						keys: ["id", "name", "status", "type"],
					},
				);
			}
			process.stderr.write(`Check status: agno-os knowledge status ${result.id}\n`);
		} catch (err) {
			handleError(err);
		}
	});

// -- knowledge list ----------------------------------------------------------

knowledgeCommand
	.command("list")
	.description("List knowledge content")
	.option("--limit <n>", "Results per page", (v: string) => Number.parseInt(v, 10), 20)
	.option("--page <n>", "Page number", (v: string) => Number.parseInt(v, 10), 1)
	.option("--sort-by <field>", "Sort field")
	.option("--sort-order <order>", "Sort order (asc, desc)")
	.option("--db-id <id>", "Database ID")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.knowledge.list({
				limit: opts.limit,
				page: opts.page,
				sortBy: opts.sortBy,
				sortOrder: opts.sortOrder,
				dbId: opts.dbId,
			});

			const r = result as unknown as Record<string, unknown>;
			const data = r.data as Record<string, unknown>[];
			const meta = r.meta as { page: number; limit: number; total_pages: number; total_count: number } | undefined;

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson({ data, meta });
				return;
			}

			outputList(
				cmd,
				data.map((k) => ({
					id: k.id ?? "",
					name: k.name ?? "",
					status: k.status ?? "",
					type: k.type ?? "",
				})),
				{
					columns: ["ID", "NAME", "STATUS", "TYPE"],
					keys: ["id", "name", "status", "type"],
					meta,
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

// -- knowledge get -----------------------------------------------------------

knowledgeCommand
	.command("get")
	.argument("<content_id>", "Content ID")
	.description("Get knowledge content details")
	.option("--db-id <id>", "Database ID")
	.action(async (contentId: string, _options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.knowledge.get(contentId, opts.dbId);

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			const k = result as Record<string, unknown>;
			const rawContent = String(k.content ?? "");
			const truncatedContent = rawContent.length > 200 ? `${rawContent.substring(0, 197)}...` : rawContent;

			outputDetail(
				cmd,
				{
					id: k.id ?? "",
					name: k.name ?? "",
					status: k.status ?? "",
					type: k.type ?? "",
					content: truncatedContent,
				},
				{
					labels: ["ID", "Name", "Status", "Type", "Content"],
					keys: ["id", "name", "status", "type", "content"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

// -- knowledge search --------------------------------------------------------

knowledgeCommand
	.command("search")
	.argument("<query>", "Search query")
	.description("Search knowledge base")
	.option("--search-type <type>", "Search type: vector, keyword, hybrid", "vector")
	.option("--max-results <n>", "Maximum results", (v: string) => Number.parseInt(v, 10))
	.option("--limit <n>", "Results per page", (v: string) => Number.parseInt(v, 10), 20)
	.option("--page <n>", "Page number", (v: string) => Number.parseInt(v, 10), 1)
	.option("--db-id <id>", "Database ID")
	.action(async (query: string, _options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.knowledge.search(query, {
				searchType: opts.searchType,
				maxResults: opts.maxResults,
				dbId: opts.dbId,
				page: opts.page,
				limit: opts.limit,
			});

			const sr = result as unknown as Record<string, unknown>;
			const data = sr.data as Record<string, unknown>[];
			const meta = sr.meta as { page: number; limit: number; total_pages: number; total_count: number } | undefined;

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson({ data, meta });
				return;
			}

			outputList(
				cmd,
				data.map((item) => {
					const rawContent = String(item.content ?? "");
					return {
						id: item.id ?? "",
						content: rawContent.length > 80 ? `${rawContent.substring(0, 77)}...` : rawContent,
						name: item.name ?? "",
						score: item.reranking_score ?? "",
					};
				}),
				{
					columns: ["ID", "CONTENT", "NAME", "SCORE"],
					keys: ["id", "content", "name", "score"],
					meta,
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

// -- knowledge status --------------------------------------------------------

knowledgeCommand
	.command("status")
	.argument("<content_id>", "Content ID")
	.description("Get knowledge content processing status")
	.option("--db-id <id>", "Database ID")
	.action(async (contentId: string, _options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.knowledge.getStatus(contentId, opts.dbId);

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			const s = result as Record<string, unknown>;
			outputDetail(
				cmd,
				{
					content_id: s.content_id ?? "",
					status: s.status ?? "",
					progress: s.progress ?? "",
					error: s.error ?? "",
				},
				{
					labels: ["Content ID", "Status", "Progress", "Error"],
					keys: ["content_id", "status", "progress", "error"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

// -- knowledge delete --------------------------------------------------------

knowledgeCommand
	.command("delete")
	.argument("<content_id>", "Content ID")
	.description("Delete knowledge content")
	.option("--db-id <id>", "Database ID")
	.action(async (contentId: string, _options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			await client.knowledge.delete(contentId, opts.dbId);
			writeSuccess("Knowledge content deleted.");
		} catch (err) {
			handleError(err);
		}
	});

// -- knowledge delete-all ----------------------------------------------------

knowledgeCommand
	.command("delete-all")
	.description("Delete all knowledge content")
	.option("--db-id <id>", "Database ID")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			await client.knowledge.deleteAll(opts.dbId);
			writeSuccess("All knowledge content deleted.");
		} catch (err) {
			handleError(err);
		}
	});

// -- knowledge config --------------------------------------------------------

knowledgeCommand
	.command("config")
	.description("Get knowledge base configuration")
	.option("--db-id <id>", "Database ID")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.knowledge.getConfig(opts.dbId);

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			const c = result as Record<string, unknown>;
			outputDetail(
				cmd,
				{
					readers: c.readers ? JSON.stringify(c.readers) : "",
					chunkers: c.chunkers ? JSON.stringify(c.chunkers) : "",
					vector_dbs: c.vector_dbs ? JSON.stringify(c.vector_dbs) : "",
				},
				{
					labels: ["Readers", "Chunkers", "Vector DBs"],
					keys: ["readers", "chunkers", "vector_dbs"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});
