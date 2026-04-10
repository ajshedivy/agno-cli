// Config module -- implemented in Plan 02
// Placeholder types and exports for client.ts to compile against

export interface ResolvedContext {
	baseUrl: string;
	securityKey?: string;
	timeout: number;
}

export interface ResolveContextOptions {
	contextName?: string;
	urlOverride?: string;
	keyOverride?: string;
	timeoutOverride?: number;
}

export function resolveContext(_options: ResolveContextOptions): ResolvedContext {
	throw new Error("Config module not yet implemented. See Plan 02.");
}
