import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputList, printJson } from "../lib/output.js";

export const registryCommand = new Command("registry").description("Manage registry");

// -- registry list -----------------------------------------------------------

registryCommand
	.command("list")
	.description("List registry items")
	.option("--type <type>", "Filter by resource type")
	.option("--name <name>", "Filter by name")
	.option("--limit <n>", "Results per page", (v: string) => Number.parseInt(v, 10), 20)
	.option("--page <n>", "Page number", (v: string) => Number.parseInt(v, 10), 1)
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.registry.list({
				resourceType: opts.type,
				name: opts.name,
				limit: opts.limit,
				page: opts.page,
			});

			const r = result as unknown as Record<string, unknown>;
			const data = (r.data as Record<string, unknown>[]) ?? (Array.isArray(result) ? result : []) as Record<string, unknown>[];
			const meta = r.meta as { page: number; limit: number; total_pages: number; total_count: number } | undefined;

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(meta ? { data, meta } : data);
				return;
			}

			outputList(
				cmd,
				(data as Record<string, unknown>[]).map((item) => ({
					id: item.id ?? "",
					name: item.name ?? "",
					type: item.resource_type ?? item.type ?? "",
					version: item.version ?? "",
				})),
				{
					columns: ["ID", "NAME", "TYPE", "VERSION"],
					keys: ["id", "name", "type", "version"],
					meta,
				},
			);
		} catch (err) {
			handleError(err);
		}
	});
