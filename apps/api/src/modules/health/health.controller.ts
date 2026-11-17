import { Controller, Get, HttpStatus } from '@nestjs/common';
import { Public } from '../../common/decorators/access.decorators';
import { AppException } from '../../common/http/app-exception';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'DB_UNAVAILABLE',
        'Database unavailable',
      );
    }
    return { status: 'ok' };
  }
}
