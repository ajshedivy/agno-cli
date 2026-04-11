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
			expect(written).toContain("Not found");
			expect(written).toContain("agno");
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

		it("maps RateLimitError to 'Rate limited' on stderr with exitCode=2", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new RateLimitError("Too many requests");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Rate limited");
			expect(process.exitCode).toBe(2);
		});

		it("maps InternalServerError to 'Server error:' on stderr with exitCode=2", async () => {
			const { handleError } = await import("../../src/lib/errors.js");
			const err = new InternalServerError("Internal failure");
			handleError(err);
			const written = stderrWrite.mock.calls.map((c) => c[0]).join("");
			expect(written).toContain("Server error:");
			expect(written).toContain("Internal failure");
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

		it("maps generic APIError with status >= 500 to exitCode=2, else exitCode=1", async () => {
			const { handleError } = await import("../../src/lib/errors.js");

			// 500+ -> exitCode=2
			const err500 = new APIError(502, "Bad gateway");
			handleError(err500);
			expect(process.exitCode).toBe(2);

			// Reset
			process.exitCode = undefined;

			// 4xx -> exitCode=1
			const err403 = new APIError(403, "Forbidden");
			handleError(err403);
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
