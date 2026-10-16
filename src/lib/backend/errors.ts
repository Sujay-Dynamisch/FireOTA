/**
 * Standardized FireOTA error codes and API envelope.
 * Shared by server functions and the public /api/v1 HTTP routes.
 */

export type ErrorCode =
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "RESOURCE_NOT_FOUND"
  | "FIREBASE_CONNECTION_ERROR"
  | "FIREBASE_AUTH_EXPIRED"
  | "FIREBASE_PERMISSION_ERROR"
  | "FIREBASE_PROJECT_NOT_FOUND"
  | "STORAGE_ERROR"
  | "FIRESTORE_ERROR"
  | "INVALID_RELEASE"
  | "INVALID_RUNTIME"
  | "INCOMPATIBLE_RUNTIME"
  | "INVALID_PLATFORM"
  | "INVALID_CHANNEL"
  | "INVALID_INPUT"
  | "UPLOAD_FAILED"
  | "CHECKSUM_MISMATCH"
  | "SIGNATURE_REQUIRED"
  | "SIGNATURE_INVALID"
  | "MANIFEST_INVALID"
  | "RELEASE_NOT_READY"
  | "RELEASE_ALREADY_PUBLISHED"
  | "RELEASE_VERSION_CONFLICT"
  | "ROLLBACK_NOT_ALLOWED"
  | "RELEASE_DELETE_NOT_ALLOWED"
  | "INVALID_STATE_TRANSITION"
  | "API_KEY_INVALID"
  | "API_KEY_EXPIRED"
  | "API_KEY_REVOKED"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "INTERNAL_ERROR";

const STATUS: Partial<Record<ErrorCode, number>> = {
  AUTHENTICATION_ERROR: 401,
  API_KEY_INVALID: 401,
  API_KEY_EXPIRED: 401,
  API_KEY_REVOKED: 401,
  AUTHORIZATION_ERROR: 403,
  RESOURCE_NOT_FOUND: 404,
  FIREBASE_PROJECT_NOT_FOUND: 404,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  RELEASE_VERSION_CONFLICT: 409,
  RELEASE_ALREADY_PUBLISHED: 409,
  SIGNATURE_REQUIRED: 422,
  SIGNATURE_INVALID: 422,
  INTERNAL_ERROR: 500,
  STORAGE_ERROR: 502,
  FIREBASE_CONNECTION_ERROR: 502,
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get status() {
    return STATUS[this.code] ?? 400;
  }

  /** Serialized form safe to hand to a client: never contains stack or driver text. */
  toJSON() {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
  }
}

export function fail(code: ErrorCode, message: string, details?: Record<string, unknown>): never {
  throw new ApiError(code, message, details);
}

export type ApiEnvelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };

/** Wraps a value in the documented success envelope. */
export function jsonOk<T>(data: T, init?: ResponseInit) {
  return Response.json({ success: true, data } satisfies ApiEnvelope<T>, init);
}

/** Converts any thrown value into a safe error envelope. Internal details stay in logs. */
export function jsonError(error: unknown, requestId?: string) {
  if (error instanceof ApiError) {
    return Response.json(
      { success: false, error: error.toJSON() } satisfies ApiEnvelope<never>,
      { status: error.status, ...(requestId ? { headers: { "x-request-id": requestId } } : {}) },
    );
  }
  // Zod rejections are caller mistakes, not server faults: report them as 400s
  // with the offending field names only.
  if (error != null && typeof error === "object" && (error as { name?: string }).name === "ZodError") {
    const issues = (error as { issues?: { path?: (string | number)[]; message?: string }[] }).issues ?? [];
    const details = issues.map((i) => `${(i.path ?? []).join(".") || "body"}: ${i.message ?? "invalid"}`).join("; ");
    return Response.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: details || "The request payload is invalid." } },
      { status: 400, ...(requestId ? { headers: { "x-request-id": requestId } } : {}) },
    );
  }
  // Malformed JSON bodies are caller mistakes too.
  if (error instanceof SyntaxError) {
    return Response.json(
      { success: false, error: { code: "INVALID_INPUT", message: "The request body is not valid JSON." } },
      { status: 400, ...(requestId ? { headers: { "x-request-id": requestId } } : {}) },
    );
  }
  console.error(JSON.stringify({ level: "error", requestId, message: String(error) }));

  return Response.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 500, ...(requestId ? { headers: { "x-request-id": requestId } } : {}) },
  );
}
