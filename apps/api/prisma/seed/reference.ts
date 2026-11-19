/**
 * Reference data required in every environment (including production):
 * trades, service areas and the first admin user. Idempotent.
 */
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '@jiko/shared';
import { AREAS, TRADES } from './data';

export async function seedReference(prisma: PrismaClient) {
  for (const t of TRADES) {
    await prisma.trade.upsert({
      where: { slug: t.slug },
      create: t,
      update: { name: t.name, sortOrder: t.sortOrder },
    });
  }
  for (const a of AREAS) {
    await prisma.serviceArea.upsert({ where: { slug: a.slug }, create: a, update: a });
  }

  const phone = normalizePhone(process.env.SEED_ADMIN_PHONE ?? '+17135550100');
  if (!phone) throw new Error('SEED_ADMIN_PHONE is not a valid US phone number');
  const admin = await prisma.user.upsert({
    where: { phone },
    create: { phone, name: process.env.SEED_ADMIN_NAME ?? 'Jiko Ops', roles: ['CLIENT', 'ADMIN'] },
    update: {},
  });
  if (!admin.roles.includes('ADMIN')) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { roles: { set: [...admin.roles, 'ADMIN'] } },
    });
  }
  console.log(
    `Reference data seeded: ${TRADES.length} trades, ${AREAS.length} areas, admin ${phone}`,
  );
  return admin;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedReference(prisma)
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
