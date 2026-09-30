export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
export function assert(
  condition: unknown,
  code: string,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(code, message, status);
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
export function abortError() {
  return new AppError('CANCELLED', 'The task was stopped.', 409);
}

/** Use only when execution is proven not to have started. */
export class NotStartedError extends AppError {}
