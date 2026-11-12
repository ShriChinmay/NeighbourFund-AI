import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, request } from "./http";

const projectSchema = z.object({ id: z.string(), status: z.string() });

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("uses the API prefix, includes credentials, and validates success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "project-1", status: "draft" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/projects/project-1", projectSchema)).resolves.toEqual({
      id: "project-1",
      status: "draft",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("returns a structured API error for failed requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Access denied" } }), { status: 403 }),
    ));
    await expect(request("/private", projectSchema)).rejects.toMatchObject({
      name: "ApiError", status: 403, code: "FORBIDDEN", message: "Access denied",
    });
  });

  it("rejects an invalid success payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 5 }), { status: 200 }),
    ));
    await expect(request("/projects/1", projectSchema)).rejects.toMatchObject({
      name: "ApiError", code: "INVALID_RESPONSE",
    });
  });

  it("handles a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(request("/projects/1", projectSchema)).rejects.toBeInstanceOf(ApiError);
    await expect(request("/projects/1", projectSchema)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("preserves abort errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
    await expect(request("/projects/1", projectSchema)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects invalid API paths", async () => {
    await expect(request("https://example.com", projectSchema)).rejects.toThrow("API path");
  });
});