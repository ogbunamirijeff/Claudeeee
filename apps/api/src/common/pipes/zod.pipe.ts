import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { AppException } from '../http/app-exception';

export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid request',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return parsed.data as z.output<T>;
  }
}
