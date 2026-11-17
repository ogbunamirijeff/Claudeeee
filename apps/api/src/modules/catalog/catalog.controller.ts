import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/access.decorators';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('catalog')
@Public()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('trades')
  trades() {
    return this.prisma.trade.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  @Get('areas')
  areas() {
    return this.prisma.serviceArea.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true, lga: true },
      orderBy: { name: 'asc' },
    });
  }
}
