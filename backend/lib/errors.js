export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') =>
  new ApiError(401, code, message);
export const forbidden = (message = 'Not allowed', code = 'FORBIDDEN') => new ApiError(403, code, message);
export const notFound = (message = 'Not found') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message, code = 'CONFLICT', details) => new ApiError(409, code, message, details);
export const invalid = (message = 'Validation failed', details, code = 'VALIDATION_FAILED') =>
  new ApiError(422, code, message, details);
export const tooLarge = (maxBytes) =>
  new ApiError(413, 'PAYLOAD_TOO_LARGE', `Request body is larger than ${maxBytes} bytes`);

export function mapDbError(err) {
  if (!err || typeof err.code !== 'string') return null;
  const message = String(err.message ?? '');
  switch (err.code) {
    case '42501':
      if (message.includes('is locked')) {
        return conflict('This task is completed and locked', 'TASK_LOCKED');
      }
      if (message.includes('append-only')) {
        return conflict('Records of this type cannot be changed or deleted', 'RECORD_IMMUTABLE');
      }
      return forbidden('Not allowed');
    case '23505':
      return conflict('A record with the same value already exists', 'DUPLICATE', {
        constraint: err.constraint,
      });
    case '23503':
      return invalid('A referenced record does not exist', { constraint: err.constraint }, 'REFERENCE_NOT_FOUND');
    case '23514':
      return invalid('A value is outside the allowed range', { constraint: err.constraint }, 'CONSTRAINT_VIOLATED');
    case '23502':
      return invalid('A required value is missing', { column: err.column }, 'MISSING_FIELD');
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
      return invalid('A value has the wrong format', undefined, 'INVALID_VALUE');
    case '40001':
    case '40P01':
      return new ApiError(503, 'RETRY', 'The database was busy. Try again.');
    default:
      return null;
  }
}

export function errorResponse(err, requestId) {
  const headers = { 'x-request-id': requestId };
  const api = err instanceof ApiError ? err : mapDbError(err);

  if (api) {
    if (api.status >= 500) log('warn', requestId, err);
    const body = { error: { code: api.code, message: api.message } };
    if (api.details !== undefined) body.error.details = api.details;
    return Response.json(body, { status: api.status, headers });
  }

  log('error', requestId, err);
  return Response.json(
    { error: { code: 'INTERNAL', message: `Something went wrong. Reference: ${requestId}` } },
    { status: 500, headers },
  );
}

function log(level, requestId, err) {
  console.error(
    JSON.stringify({ level, requestId, name: err?.name, message: err?.message, code: err?.code, stack: err?.stack }),
  );
}
