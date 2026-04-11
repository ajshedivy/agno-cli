import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { getOutputFormat, outputDetail, outputList, printJson, writeSuccess, writeWarning } from "../lib/output.js";

export const authCommand = new Command("auth").description("Authentication and connections");

// -- auth me -----------------------------------------------------------------

authCommand
	.command("me")
	.description("Show current auth info")
	.action(async (_options, cmd) => {
		try {
			const client = getClient(cmd);
			const result = await client.auth.me();

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			const u = result as Record<string, unknown>;
			outputDetail(
				cmd,
				{
					id: u.id ?? "",
					email: u.email ?? "",
					role: u.role ?? "",
					name: u.name ?? "",
				},
				{
					labels: ["ID", "Email", "Role", "Name"],
					keys: ["id", "email", "role", "name"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

// -- auth key (nested) -------------------------------------------------------

const keyCommand = new Command("key").description("Manage API keys");

keyCommand
	.command("list")
	.description("List API keys")
	.action(async (_options, cmd) => {
		try {
			const client = getClient(cmd);
			const result = await client.auth.keys.list();

			const data = (Array.isArray(result) ? result : []) as Record<string, unknown>[];

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(data);
				return;
			}

			outputList(
				cmd,
				data.map((k) => ({
					id: k.id ?? "",
					name: k.name ?? "",
					created_at: k.created_at ?? "",
					expires_at: k.expires_at ?? "",
				})),
				{
					columns: ["ID", "NAME", "CREATED_AT", "EXPIRES_AT"],
					keys: ["id", "name", "created_at", "expires_at"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

keyCommand
	.command("create")
	.description("Create a new API key")
	.requiredOption("--name <name>", "Key name (required)")
	.option("--scopes <scopes>", "Comma-separated scopes")
	.option("--expires-at <date>", "Expiration date (ISO 8601)")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.auth.keys.create({
				name: opts.name,
				scopes: opts.scopes ? opts.scopes.split(",") : undefined,
				expiresAt: opts.expiresAt,
			});

			const format = getOutputFormat(cmd);
			const k = result as Record<string, unknown>;
			if (format === "json") {
				printJson(result);
			} else {
				outputDetail(
					cmd,
					{
						id: k.id ?? "",
						name: k.name ?? "",
						key: k.key ?? "",
						created_at: k.created_at ?? "",
					},
					{
						labels: ["ID", "Name", "Key (save this!)", "Created"],
						keys: ["id", "name", "key", "created_at"],
					},
				);
				writeWarning("This key will not be shown again.");
			}
		} catch (err) {
			handleError(err);
		}
	});

keyCommand
	.command("get")
	.argument("<key_id>", "Key ID")
	.description("Get API key details")
	.action(async (keyId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			const result = await client.auth.keys.get(keyId);

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			const k = result as Record<string, unknown>;
			outputDetail(
				cmd,
				{
					id: k.id ?? "",
					name: k.name ?? "",
					created_at: k.created_at ?? "",
					expires_at: k.expires_at ?? "",
				},
				{
					labels: ["ID", "Name", "Created", "Expires"],
					keys: ["id", "name", "created_at", "expires_at"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

keyCommand
	.command("revoke")
	.argument("<key_id>", "Key ID")
	.description("Revoke an API key")
	.action(async (keyId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			await client.auth.keys.revoke(keyId);
			writeSuccess(`API key ${keyId} revoked.`);
		} catch (err) {
			handleError(err);
		}
	});

keyCommand
	.command("rotate")
	.argument("<key_id>", "Key ID")
	.description("Rotate an API key")
	.action(async (keyId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			const result = await client.auth.keys.rotate(keyId);

			const format = getOutputFormat(cmd);
			const k = result as Record<string, unknown>;
			if (format === "json") {
				printJson(result);
			} else {
				outputDetail(
					cmd,
					{
						id: k.id ?? "",
						name: k.name ?? "",
						key: k.key ?? "",
						created_at: k.created_at ?? "",
					},
					{
						labels: ["ID", "Name", "New Key (save this!)", "Created"],
						keys: ["id", "name", "key", "created_at"],
					},
				);
				writeWarning("This key will not be shown again.");
			}
		} catch (err) {
			handleError(err);
		}
	});

authCommand.addCommand(keyCommand);

// -- auth connection (nested) ------------------------------------------------

const connectionCommand = new Command("connection").description("Manage connections");

connectionCommand
	.command("list")
	.description("List connections")
	.action(async (_options, cmd) => {
		try {
			const client = getClient(cmd);
			const result = await client.auth.connections.list();

			const data = (Array.isArray(result) ? result : []) as Record<string, unknown>[];

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(data);
				return;
			}

			outputList(
				cmd,
				data.map((c) => ({
					id: c.id ?? "",
					name: c.name ?? "",
					host: c.host ?? "",
					port: c.port ?? "",
					is_default: c.is_default ?? "",
				})),
				{
					columns: ["ID", "NAME", "HOST", "PORT", "IS_DEFAULT"],
					keys: ["id", "name", "host", "port", "is_default"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

connectionCommand
	.command("create")
	.description("Create a new connection")
	.requiredOption("--name <name>", "Connection name (required)")
	.requiredOption("--host <host>", "Hostname or IP (required)")
	.requiredOption("--port <port>", "Port number (required)")
	.requiredOption("--user <user>", "Username (required)")
	.requiredOption("--password <password>", "Password (required)")
	.option("--is-default", "Set as default connection")
	.action(async (_options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);
			const result = await client.auth.connections.create({
				name: opts.name,
				host: opts.host,
				port: Number.parseInt(opts.port, 10),
				user: opts.user,
				password: opts.password,
				isDefault: opts.isDefault ?? false,
			});

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			const c = result as Record<string, unknown>;
			outputDetail(
				cmd,
				{
					id: c.id ?? "",
					name: c.name ?? "",
					host: c.host ?? "",
					port: c.port ?? "",
					is_default: c.is_default ?? "",
				},
				{
					labels: ["ID", "Name", "Host", "Port", "Default"],
					keys: ["id", "name", "host", "port", "is_default"],
				},
			);
			writeSuccess("Connection created.");
		} catch (err) {
			handleError(err);
		}
	});

connectionCommand
	.command("get")
	.argument("<conn_id>", "Connection ID")
	.description("Get connection details")
	.action(async (connId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			const result = await client.auth.connections.get(connId);

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			const c = result as Record<string, unknown>;
			outputDetail(
				cmd,
				{
					id: c.id ?? "",
					name: c.name ?? "",
					host: c.host ?? "",
					port: c.port ?? "",
					user: c.user ?? "",
					is_default: c.is_default ?? "",
				},
				{
					labels: ["ID", "Name", "Host", "Port", "User", "Default"],
					keys: ["id", "name", "host", "port", "user", "is_default"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

connectionCommand
	.command("update")
	.argument("<conn_id>", "Connection ID")
	.description("Update a connection")
	.option("--name <name>", "Connection name")
	.option("--host <host>", "Hostname or IP")
	.option("--port <port>", "Port number")
	.option("--user <user>", "Username")
	.option("--password <password>", "Password")
	.option("--is-default", "Set as default connection")
	.action(async (connId: string, _options, cmd) => {
		try {
			const opts = cmd.optsWithGlobals();
			const client = getClient(cmd);

			const updateOpts: Record<string, unknown> = {};
			if (opts.name) updateOpts.name = opts.name;
			if (opts.host) updateOpts.host = opts.host;
			if (opts.port) updateOpts.port = Number.parseInt(opts.port, 10);
			if (opts.user) updateOpts.user = opts.user;
			if (opts.password) updateOpts.password = opts.password;
			if (opts.isDefault !== undefined) updateOpts.isDefault = opts.isDefault;

			const result = await client.auth.connections.update(connId, updateOpts);

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			const c = result as Record<string, unknown>;
			outputDetail(
				cmd,
				{
					id: c.id ?? "",
					name: c.name ?? "",
					host: c.host ?? "",
					port: c.port ?? "",
					is_default: c.is_default ?? "",
				},
				{
					labels: ["ID", "Name", "Host", "Port", "Default"],
					keys: ["id", "name", "host", "port", "is_default"],
				},
			);
			writeSuccess("Connection updated.");
		} catch (err) {
			handleError(err);
		}
	});

connectionCommand
	.command("delete")
	.argument("<conn_id>", "Connection ID")
	.description("Delete a connection")
	.action(async (connId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			await client.auth.connections.delete(connId);
			writeSuccess(`Connection ${connId} deleted.`);
		} catch (err) {
			handleError(err);
		}
	});

connectionCommand
	.command("test")
	.argument("<conn_id>", "Connection ID")
	.description("Test a connection")
	.action(async (connId: string, _options, cmd) => {
		try {
			const client = getClient(cmd);
			const result = await client.auth.connections.test(connId);

			const format = getOutputFormat(cmd);
			if (format === "json") {
				printJson(result);
				return;
			}

			const t = result as Record<string, unknown>;
			outputDetail(
				cmd,
				{
					success: t.success ?? "",
					message: t.message ?? "",
				},
				{
					labels: ["Success", "Message"],
					keys: ["success", "message"],
				},
			);
		} catch (err) {
			handleError(err);
		}
	});

authCommand.addCommand(connectionCommand);
