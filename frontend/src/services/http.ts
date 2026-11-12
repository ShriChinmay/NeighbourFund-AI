import { z } from "zod";

const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Only this service should use fetch in new frontend features. */
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("API path must begin with a single forward slash");
  }

  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch (error) {
    if (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError"
  ) {
    throw error;
  }

    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Unable to reach the server",
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw new ApiError(
      response.status,
      parsed.success ? (parsed.data.error.code ?? "HTTP_ERROR") : "HTTP_ERROR",
      parsed.success ? parsed.data.error.message : `Request failed (${response.status})`,
      parsed.success ? parsed.data.error.details : undefined,
    );
  }

  const validated = schema.safeParse(payload);
  if (!validated.success) {
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "Server returned an unexpected response",
      validated.error.issues,
    );
  }
  return validated.data;
}