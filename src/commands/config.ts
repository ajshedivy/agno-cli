import { Command } from "commander";
import { type AgnoConfig, configExists, getConfigPath, loadConfig, saveConfig } from "../lib/config.js";
import { getOutputFormat, maskKey, outputDetail, outputList, writeError, writeSuccess } from "../lib/output.js";

export const configCommand = new Command("config").description("Manage endpoint contexts and configuration");

// ── config init ──────────────────────────────────────────────────────

configCommand
	.command("init")
	.description("Initialize configuration with a default context")
	.option("--url <url>", "Base URL for the default context", "http://localhost:7777")
	.option("--key <key>", "Security key for the default context")
	.option("--timeout <seconds>", "Timeout in seconds", Number.parseFloat, 60)
	.option("-f, --force", "Overwrite existing config")
	.action((_options, cmd) => {
		// Use optsWithGlobals() because --url, --key, --timeout collide with
		// global options of the same name. Commander routes the value to the
		// root program; optsWithGlobals() merges them so the value is visible.
		const options = cmd.optsWithGlobals();
		if (configExists() && !options.force) {
			writeError(`Config already exists at ${getConfigPath()}. Use --force to overwrite.`);
			process.exitCode = 1;
			return;
		}

		const config: AgnoConfig = {
			current_context: "default",
			contexts: {
				default: {
					baseUrl: (options.url as string) ?? "http://localhost:7777",
					timeout: (options.timeout as number) ?? 60,
					securityKey: options.key as string | undefined,
				},
			},
		};
		saveConfig(config);
		writeSuccess(`Config initialized at ${getConfigPath()}`);
	});

// ── config add ───────────────────────────────────────────────────────

configCommand
	.command("add")
	.argument("<name>", "Context name")
	.description("Add a new context")
	.option("--url <url>", "Base URL of the AgentOS instance (required)")
	.option("--key <key>", "Security key")
	.option("--timeout <seconds>", "Timeout in seconds", Number.parseFloat, 60)
	.action((name: string, _options, cmd) => {
		// Use optsWithGlobals() -- see config init comment for rationale.
		const options = cmd.optsWithGlobals();

		if (!options.url) {
			writeError("Missing required option --url <url>");
			process.exitCode = 1;
			return;
		}

		const config = loadConfig();

		if (config.contexts[name]) {
			writeError(`Context '${name}' already exists. Use 'config set' to modify it.`);
			process.exitCode = 1;
			return;
		}

		config.contexts[name] = {
			baseUrl: options.url as string,
			timeout: (options.timeout as number) ?? 60,
			securityKey: options.key as string | undefined,
		};
		saveConfig(config);
		writeSuccess(`Context '${name}' added.`);
	});

// ── config use ───────────────────────────────────────────────────────

configCommand
	.command("use")
	.argument("<name>", "Context to activate")
	.description("Switch active context")
	.action((name: string) => {
		const config = loadConfig();

		if (!config.contexts[name]) {
			writeError(`Context '${name}' not found. Run 'agno-os config list' to see available contexts.`);
			process.exitCode = 1;
			return;
		}

		config.current_context = name;
		saveConfig(config);
		writeSuccess(`Switched to context '${name}'.`);
	});

// ── config list ──────────────────────────────────────────────────────

configCommand
	.command("list")
	.description("List all configured contexts")
	.action((_options, cmd) => {
		const config = loadConfig();
		const format = getOutputFormat(cmd);

		if (format === "json") {
			const data = Object.entries(config.contexts).map(([name, ctx]) => ({
				name,
				url: ctx.baseUrl,
				timeout: ctx.timeout,
				active: name === config.current_context,
			}));
			process.stdout.write(`${JSON.stringify({ data }, null, 2)}\n`);
			return;
		}

		const data = Object.entries(config.contexts).map(([name, ctx]) => ({
			name: name === config.current_context ? `* ${name}` : `  ${name}`,
			url: ctx.baseUrl,
			timeout: ctx.timeout,
		}));

		outputList(cmd, data, {
			columns: ["CONTEXT", "URL", "TIMEOUT"],
			keys: ["name", "url", "timeout"],
		});
	});

// ── config show ──────────────────────────────────────────────────────

configCommand
	.command("show")
	.description("Show active context details")
	.action((_options, cmd) => {
		const config = loadConfig();
		const name = config.current_context;
		const ctx = config.contexts[name];

		if (!ctx) {
			writeError(`Active context '${name}' not found in config.`);
			process.exitCode = 1;
			return;
		}

		outputDetail(
			cmd,
			{
				context: name,
				base_url: ctx.baseUrl,
				timeout: ctx.timeout,
				security_key: maskKey(ctx.securityKey),
			},
			{
				labels: ["Context", "Base URL", "Timeout", "Security Key"],
				keys: ["context", "base_url", "timeout", "security_key"],
			},
		);
	});

// ── config set ───────────────────────────────────────────────────────

configCommand
	.command("set")
	.argument("<key>", "Config key (base_url, timeout, security_key)")
	.argument("<value>", "New value")
	.description("Set a config value in active context")
	.action((key: string, value: string) => {
		const config = loadConfig();
		const ctx = config.contexts[config.current_context];

		if (!ctx) {
			writeError(`Active context '${config.current_context}' not found.`);
			process.exitCode = 1;
			return;
		}

		switch (key) {
			case "base_url":
				ctx.baseUrl = value;
				break;
			case "timeout":
				ctx.timeout = Number.parseFloat(value);
				break;
			case "security_key":
				ctx.securityKey = value;
				break;
			default:
				writeError(`Unknown config key '${key}'. Valid keys: base_url, timeout, security_key`);
				process.exitCode = 1;
				return;
		}

		saveConfig(config);
		writeSuccess(
			`Set ${key} to ${key === "security_key" ? maskKey(value) : value} in context '${config.current_context}'.`,
		);
	});

// ── config remove ────────────────────────────────────────────────────

configCommand
	.command("remove")
	.argument("<name>", "Context to remove")
	.description("Remove a context")
	.action((name: string) => {
		const config = loadConfig();

		if (!config.contexts[name]) {
			writeError(`Context '${name}' not found.`);
			process.exitCode = 1;
			return;
		}

		if (name === config.current_context) {
			writeError(
				`Cannot remove active context '${name}'. Switch to another context first with 'agno-os config use <name>'.`,
			);
			process.exitCode = 1;
			return;
		}

		delete config.contexts[name];
		saveConfig(config);
		writeSuccess(`Context '${name}' removed.`);
	});
