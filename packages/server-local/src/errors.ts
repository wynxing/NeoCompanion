/**
 * Typed error hierarchy for the server.
 * All business errors inherit from HttpError so setErrorHandler can map them
 * to consistent HTTP responses.
 *
 * Usage:
 *   throw new BadRequestError("title is required")
 *   throw new NotFoundError("task", taskId)
 */

export abstract class HttpError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── 400 Bad Request ──

export class BadRequestError extends HttpError {
  readonly statusCode = 400;
  readonly code = "BAD_REQUEST";
}

export class ValidationError extends HttpError {
  readonly statusCode = 400;
  readonly code = "VALIDATION_ERROR";
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

// ── 401 Unauthorized ──

export class UnauthorizedError extends HttpError {
  readonly statusCode = 401;
  readonly code = "UNAUTHORIZED";
}

// ── 403 Forbidden ──

export class ForbiddenError extends HttpError {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "forbidden") {
    super(message);
  }
}

// ── 404 Not Found ──

export class NotFoundError extends HttpError {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(kind: string, id?: string) {
    super(id ? `${kind} "${id}" not found` : `${kind} not found`);
  }
}

// ── 410 Gone (for stale permission requests) ──

export class StaleError extends HttpError {
  readonly statusCode = 410;
  readonly code = "STALE";
  constructor(message = "request stale") {
    super(message);
  }
}

// ── 503 Service Unavailable ──

export class ServiceUnavailableError extends HttpError {
  readonly statusCode = 503;
  readonly code = "SERVICE_UNAVAILABLE";
  constructor(message = "service unavailable") {
    super(message);
  }
}

// ── Type Guard ──

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
