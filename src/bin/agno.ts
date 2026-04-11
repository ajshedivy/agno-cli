// EPIPE handler -- MUST be first, before any imports that might write to stdout
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
	if (err.code === "EPIPE") process.exit(0);
	throw err;
});
process.stderr.on("error", (err: NodeJS.ErrnoException) => {
	if (err.code === "EPIPE") process.exit(0);
	throw err;
});

import { Command, Option } from "commander";
import { handleError } from "../lib/errors.js";
import { handleNoColorFlag } from "../lib/output.js";

// Version injected by tsup define at build time.
// During dev (tsx), process.env.CLI_VERSION won't be replaced, so fall back to "dev".
const VERSION = process.env.CLI_VERSION ?? "dev";

const program = new Command("agno-cli")
	.version(VERSION, "-V, --version")
	.description("CLI for interacting with AgentOS instances")
	.option("-c, --context <name>", "Override active context")
	.option("--url <url>", "Override base URL")
	.option("--key <key>", "Override security key")
	.option("--timeout <seconds>", "Override timeout", Number.parseFloat)
	.option("--no-color", "Disable color output")
	.option("--json [fields]", "Output JSON with optional field selection (e.g., --json id,name)")
	.addOption(new Option("-o, --output <format>", "Output format").choices(["json", "table"]));

// Pre-action hook: bridge --no-color flag to chalk + validate option conflicts
program.hook("preAction", (thisCommand) => {
	handleNoColorFlag(thisCommand);
	const globals = thisCommand.optsWithGlobals();
	if (globals.output === "table" && globals.json !== undefined) {
		process.stderr.write("Error: --output table and --json cannot be used together.\n");
		process.exit(1);
	}
});

// Help examples on root command
program.addHelpText(
	"after",
	`
Examples:
  $ agno-cli config init --url http://localhost:7777
  $ agno-cli config show
  $ agno-cli agent list --output json
  $ agno-cli agent run my-agent "Hello" --stream
`,
);

// Register commands
const { configCommand } = await import("../commands/config.js");
program.addCommand(configCommand);

const { statusCommand } = await import("../commands/status.js");
program.addCommand(statusCommand);

const { agentCommand } = await import("../commands/agents.js");
program.addCommand(agentCommand);

const { teamCommand } = await import("../commands/teams.js");
program.addCommand(teamCommand);

const { workflowCommand } = await import("../commands/workflows.js");
program.addCommand(workflowCommand);

const { modelCommand } = await import("../commands/models.js");
program.addCommand(modelCommand);

const { metricsCommand } = await import("../commands/metrics.js");
program.addCommand(metricsCommand);

const { sessionCommand } = await import("../commands/sessions.js");
program.addCommand(sessionCommand);

const { memoryCommand } = await import("../commands/memories.js");
program.addCommand(memoryCommand);

const { knowledgeCommand } = await import("../commands/knowledge.js");
program.addCommand(knowledgeCommand);

const { traceCommand } = await import("../commands/traces.js");
program.addCommand(traceCommand);

const { evalCommand } = await import("../commands/evals.js");
program.addCommand(evalCommand);

const { approvalCommand } = await import("../commands/approvals.js");
program.addCommand(approvalCommand);

const { authCommand } = await import("../commands/auth.js");
program.addCommand(authCommand);

const { componentCommand } = await import("../commands/components.js");
program.addCommand(componentCommand);

const { scheduleCommand } = await import("../commands/schedules.js");
program.addCommand(scheduleCommand);

const { databaseCommand } = await import("../commands/database.js");
program.addCommand(databaseCommand);

const { registryCommand } = await import("../commands/registry.js");
program.addCommand(registryCommand);

// Show help when invoked with no subcommand
program.action(() => {
	program.outputHelp();
});

// Error handling for Commander parse failures
program.exitOverride();
try {
	await program.parseAsync(process.argv);
} catch (err: unknown) {
	// Commander throws for --help and --version (exitOverride),
	// which is expected behavior -- only handle real errors
	if (err instanceof Error && "exitCode" in err) {
		const cmdErr = err as Error & { exitCode: number };
		if (cmdErr.exitCode !== 0) {
			handleError(err);
		}
	} else {
		handleError(err);
	}
}
