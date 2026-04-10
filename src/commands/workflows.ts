import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputDetail, outputList } from "../lib/output.js";

export const workflowCommand = new Command("workflow").description("Manage workflows");

workflowCommand
	.command("list")
	.description("List all workflows")
	.option("--limit <n>", "Results per page", (v: string) => Number.parseInt(v, 10), 20)
	.option("--page <n>", "Page number", (v: string) => Number.parseInt(v, 10), 1)
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const workflows = await client.workflows.list();

			const limit = opts.limit as number;
			const page = opts.page as number;
			const start = (page - 1) * limit;
			const paged = workflows.slice(start, start + limit);
			const meta = {
				page,
				limit,
				total_pages: Math.ceil(workflows.length / limit),
				total_count: workflows.length,
			};

			outputList(
				cmd,
				paged.map((w) => ({
					id: w.id ?? "",
					name: w.name ?? "",
					description: w.description ?? "",
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

workflowCommand
	.command("get")
	.argument("<workflow_id>", "Workflow ID")
	.description("Get workflow details")
	.action(async (workflowId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			const workflow = await client.workflows.get(workflowId);

			const format = getOutputFormat(cmd);
			if (format === "json") {
				process.stdout.write(`${JSON.stringify(workflow, null, 2)}\n`);
				return;
			}

			outputDetail(
				cmd,
				{
					id: workflow.id ?? "",
					name: workflow.name ?? "",
					description: workflow.description ?? "",
					steps: Array.isArray(workflow.steps) ? workflow.steps.length : 0,
					workflow_agent: workflow.workflow_agent ? "Yes" : "No",
				},
				{
					labels: ["ID", "Name", "Description", "Steps", "Workflow Agent"],
					keys: ["id", "name", "description", "steps", "workflow_agent"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});
