export enum ErrorCode {
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  RATE_LIMITED = "RATE_LIMITED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  CONFLICT = "CONFLICT",
  BAD_REQUEST = "BAD_REQUEST",
}

const STATUS_MAP: Record<ErrorCode, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.VALIDATION_ERROR]: 422,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.BAD_REQUEST]: 400,
};

export class AppError extends Error {
  public status: number;

  constructor(
    public code: ErrorCode,
    message: string,
    status?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.status = status ?? STATUS_MAP[code];
  }
}

export function unauthorized(message = "Unauthorized", details?: unknown): AppError {
  return new AppError(ErrorCode.UNAUTHORIZED, message, 401, details);
}

export function forbidden(message = "Forbidden", details?: unknown): AppError {
  return new AppError(ErrorCode.FORBIDDEN, message, 403, details);
}

export function notFound(message = "Not found", details?: unknown): AppError {
  return new AppError(ErrorCode.NOT_FOUND, message, 404, details);
}

export function validationError(message = "Validation error", details?: unknown): AppError {
  return new AppError(ErrorCode.VALIDATION_ERROR, message, 422, details);
}

export function badRequest(message = "Bad request", details?: unknown): AppError {
  return new AppError(ErrorCode.BAD_REQUEST, message, 400, details);
}

export function conflict(message = "Conflict", details?: unknown): AppError {
  return new AppError(ErrorCode.CONFLICT, message, 409, details);
}

export function internalError(message = "Internal server error", details?: unknown): AppError {
  return new AppError(ErrorCode.INTERNAL_ERROR, message, 500, details);
}
