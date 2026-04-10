import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { outputList } from "../lib/output.js";

export const modelCommand = new Command("models").description("List available models");

modelCommand
	.command("list")
	.description("List all available models")
	.option("--limit <n>", "Results per page", Number.parseInt, 20)
	.option("--page <n>", "Page number", Number.parseInt, 1)
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const models = await client.models.list();

			const limit = opts.limit as number;
			const page = opts.page as number;
			const start = (page - 1) * limit;
			const paged = models.slice(start, start + limit);
			const meta = {
				page,
				limit,
				total_pages: Math.ceil(models.length / limit),
				total_count: models.length,
			};

			outputList(
				cmd,
				paged.map((m) => ({
					name: m.name ?? "",
					model: m.model ?? "",
					provider: m.provider ?? "",
				})),
				{
					columns: ["NAME", "MODEL", "PROVIDER"],
					keys: ["name", "model", "provider"],
					meta,
				},
			);
		} catch (err) {
			handleError(err);
		}
	});
