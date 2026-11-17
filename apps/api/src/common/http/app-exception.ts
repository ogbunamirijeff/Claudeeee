import { HttpException, HttpStatus } from '@nestjs/common';

/** Errors with a stable machine-readable `code` the clients can switch on. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}
