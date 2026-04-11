import { Command } from "commander";
import { getBaseUrl, getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { writeSuccess } from "../lib/output.js";

export const databaseCommand = new Command("database").description("Manage databases");

// -- database migrate --------------------------------------------------------

databaseCommand
	.command("migrate")
	.argument("<db_id>", "Database ID")
	.description("Run database migrations")
	.option("--target-version <version>", "Target migration version")
	.action(async (dbId: string, _options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			await client.database.migrate(dbId, {
				targetVersion: opts.targetVersion,
			});

			writeSuccess("Database migration complete.");
		} catch (err) {
			handleError(err, { url: getBaseUrl(cmd) });
		}
	});
