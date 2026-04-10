// Errors module -- placeholder, implemented in Task 3
export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

export function handleError(_err: unknown): never {
	process.exitCode = 2;
	process.exit();
}
