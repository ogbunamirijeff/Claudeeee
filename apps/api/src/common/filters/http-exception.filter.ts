import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody } from '@jiko/shared';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let body: ApiErrorBody;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse() as string | Record<string, unknown>;
      const obj = typeof r === 'string' ? { message: r } : r;
      body = {
        statusCode: status,
        code: (obj.code as string) ?? DEFAULT_CODES[status] ?? 'ERROR',
        message: Array.isArray(obj.message) ? obj.message.join('; ') : String(obj.message ?? exception.message),
        ...(obj.details !== undefined ? { details: obj.details } : {}),
      };
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      body = { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL', message: 'Something went wrong' };
    }
    res.status(body.statusCode).json(body);
  }
}
