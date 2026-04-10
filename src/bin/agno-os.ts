// EPIPE handler -- MUST be first, before any imports that might write to stdout
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
	if (err.code === "EPIPE") process.exit(0);
	throw err;
});
process.stderr.on("error", (err: NodeJS.ErrnoException) => {
	if (err.code === "EPIPE") process.exit(0);
	throw err;
});

import { Command } from "commander";
import { handleError } from "../lib/errors.js";
import { handleNoColorFlag } from "../lib/output.js";

// Version injected by tsup define at build time.
// During dev (tsx), process.env.CLI_VERSION won't be replaced, so fall back to "dev".
const VERSION = process.env.CLI_VERSION ?? "dev";

const program = new Command("agno-os")
	.version(VERSION, "-V, --version")
	.description("CLI for interacting with AgentOS instances")
	.option("-c, --context <name>", "Override active context")
	.option("-o, --output <format>", "Output format: table, json")
	.option("--url <url>", "Override base URL")
	.option("--key <key>", "Override security key")
	.option("--timeout <seconds>", "Override timeout", Number.parseFloat)
	.option("--no-color", "Disable color output")
	.option("-v, --verbose", "Enable verbose output");

// Pre-action hook: bridge --no-color flag to chalk
program.hook("preAction", (thisCommand) => {
	handleNoColorFlag(thisCommand);
});

// Help examples on root command
program.addHelpText(
	"after",
	`
Examples:
  $ agno-os config init --url http://localhost:7777
  $ agno-os config show
  $ agno-os agent list --output json
  $ agno-os agent run my-agent "Hello" --stream
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
