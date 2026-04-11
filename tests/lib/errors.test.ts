import {
	APIError,
	AuthenticationError,
	BadRequestError,
	InternalServerError,
	NotFoundError,
	RateLimitError,
	RemoteServerUnavailableError,
	UnprocessableEntityError,
} from "@worksofadam/agentos-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("errors module", () => {
	let stderrWrite: ReturnType<typeof vi.spyOn>;
	let stdoutWrite: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		process.exitCode = undefined;
	});

	afterEach(() => {
		process.exitCode = undefined;
	});

	describe("handleError", () => {
		it("maps AuthenticationError to actionable message on stderr with exitCode=1", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new AuthenticationError("Invalid API key");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Authentication failed");
			expect(written).toContain("agno-cli config show");
			expect(process.exitCode).toBe(1);
			expect(exitSpy).toHaveBeenCalled();
		});

		it("maps NotFoundError to suggestion message on stderr with exitCode=1", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new NotFoundError("Agent not found");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("not found");
			expect(process.exitCode).toBe(1);
		});

		it("maps NotFoundError with resource context to include resource type", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new NotFoundError("Not found");
			handleError(err, { resource: "Agent" });
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Agent not found");
			expect(process.exitCode).toBe(1);
		});

		it("maps NotFoundError without context to 'Resource not found' (backward compat)", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new NotFoundError("Not found");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Resource not found");
			expect(process.exitCode).toBe(1);
		});

		it("maps BadRequestError to 'Invalid request:' on stderr with exitCode=1", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new BadRequestError("Missing required field: name");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Invalid request:");
			expect(written).toContain("Missing required field: name");
			expect(process.exitCode).toBe(1);
		});

		it("maps UnprocessableEntityError to 'Validation error:' on stderr with exitCode=1", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new UnprocessableEntityError("Invalid agent config");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Validation error:");
			expect(written).toContain("Invalid agent config");
			expect(process.exitCode).toBe(1);
		});

		it("maps UnprocessableEntityError with JSON detail array to parsed bullet list", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const detail = JSON.stringify({
				detail: [
					{ loc: ["body", "name"], msg: "field required" },
					{ loc: ["body", "description"], msg: "too long" },
				],
			});
			const err = new UnprocessableEntityError(detail);
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Validation error:");
			expect(written).toContain("  - name: field required");
			expect(written).toContain("  - description: too long");
			expect(process.exitCode).toBe(1);
		});

		it("maps UnprocessableEntityError with plain text to fallback format", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new UnprocessableEntityError("plain text error");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Validation error: plain text error");
			expect(process.exitCode).toBe(1);
		});

		it("maps RateLimitError to 'Rate limited' on stderr with exitCode=2", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new RateLimitError("Too many requests");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Rate limited");
			expect(process.exitCode).toBe(2);
		});

		it("maps InternalServerError to 'Server error:' with agno-cli status suggestion on stderr with exitCode=2", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new InternalServerError("db crash");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Server error:");
			expect(written).toContain("db crash");
			expect(written).toContain("agno-cli status");
			expect(process.exitCode).toBe(2);
		});

		it("maps RemoteServerUnavailableError to 'Server unavailable' on stderr with exitCode=2", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new RemoteServerUnavailableError("Service unavailable");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Server unavailable");
			expect(process.exitCode).toBe(2);
		});

		it("maps APIError 403 with 'admin' in message to admin scope message", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new APIError(403, "admin scope required");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("admin scope");
			expect(written).toContain("API key permissions");
			expect(process.exitCode).toBe(1);
		});

		it("maps APIError 403 without 'admin' to generic access denied message", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new APIError(403, "unauthorized");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Access denied");
			expect(written).toContain("API key permissions");
			expect(process.exitCode).toBe(1);
		});

		it("maps generic APIError with status >= 500 to exitCode=2, else exitCode=1", async () => {
			const { handleError } = await import("../../src/lib/errors.js");

			// 500+ -> exitCode=2
			const err500 = new APIError(502, "Bad gateway");
			handleError(err500);
			expect(process.exitCode).toBe(2);

			// Reset
			process.exitCode = undefined;

			// 418 -> exitCode=1 (not 403, so falls through to generic)
			const err418 = new APIError(418, "I'm a teapot");
			handleError(err418);
			expect(process.exitCode).toBe(1);
		});

		it("maps ECONNREFUSED to 'Cannot connect' on stderr with exitCode=2", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new Error("connect ECONNREFUSED 127.0.0.1:8080");
			(err as NodeJS.ErrnoException).code = "ECONNREFUSED";
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Cannot connect");
			expect(process.exitCode).toBe(2);
		});

		it("maps ECONNREFUSED with URL context to include server URL", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new Error("connect ECONNREFUSED 127.0.0.1:8080");
			(err as NodeJS.ErrnoException).code = "ECONNREFUSED";
			handleError(err, { url: "http://localhost:8000" });
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Cannot connect");
			expect(written).toContain("http://localhost:8000");
			expect(process.exitCode).toBe(2);
		});

		it("maps APIError with status=0 and 'Network error' to connection error with URL context", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new APIError(0, "Network error: fetch failed");
			handleError(err, { url: "http://localhost:8000" });
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Cannot connect");
			expect(written).toContain("http://localhost:8000");
			expect(process.exitCode).toBe(2);
		});

		it("maps ENOTFOUND to 'Cannot connect' on stderr with exitCode=2", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new Error("getaddrinfo ENOTFOUND api.example.com");
			(err as NodeJS.ErrnoException).code = "ENOTFOUND";
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Cannot connect");
			expect(process.exitCode).toBe(2);
		});

		it("maps unknown Error to error message on stderr with exitCode=2", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new Error("Something unexpected");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Something unexpected");
			expect(process.exitCode).toBe(2);
		});

		it("writes all error output to stderr, never stdout", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			handleError(new AuthenticationError("test"));
			expect(stdoutWrite).not.toHaveBeenCalled();
			expect(stderrWrite).toHaveBeenCalled();
		});
	});

	describe("ConfigError", () => {
		it('has name "ConfigError"', async () => {
			const { ConfigError } = await import("../../src/lib/errors.js");
			const err = new ConfigError("Config not found");
			expect(err.name).toBe("ConfigError");
			expect(err.message).toBe("Config not found");
			expect(err).toBeInstanceOf(Error);
		});
	});
});
