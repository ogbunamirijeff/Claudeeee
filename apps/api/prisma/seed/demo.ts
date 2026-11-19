/**
 * Demo data for local development and staging: ~30 artisans at various verification stages,
 * clients, and open job requests. Refuses to run in production. Idempotent.
 */
import { PrismaClient, type SealStatus, type VerificationType } from '@prisma/client';
import { CLIENT_NAMES, FIRST_NAMES, LAST_NAMES, SAMPLE_JOBS } from './data';
import { seedReference } from './reference';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

const CHECK_TYPES: VerificationType[] = [
  'GOVERNMENT_ID',
  'STATE_LICENSE',
  'INSURANCE',
  'BACKGROUND_CHECK',
  'REFERENCES',
  'SKILLS_ASSESSMENT',
];

// Deterministic PRNG so every run produces the same demo data.
let s = 42;
const rand = () => (s = (s * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

// 555-0100…0199 numbers are reserved for fiction: they never reach a real phone.
const artisanPhone = (i: number) => `+1713555${String(101 + i).padStart(4, '0')}`;
const clientPhone = (i: number) => `+1832555${String(150 + i).padStart(4, '0')}`;

async function main() {
  const prisma = new PrismaClient();
  try {
    const admin = await seedReference(prisma);
    const trades = await prisma.trade.findMany();
    const areas = await prisma.serviceArea.findMany();
    const bySlug = <T extends { slug: string }>(xs: T[], slug: string) =>
      xs.find((x) => x.slug === slug)!;

    // 30 artisans: 0–19 sealed, 20–25 mid-verification, 26–29 just signed up.
    for (let i = 0; i < 30; i++) {
      const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]}`;
      const trade = trades[i % trades.length]!;
      const home = areas[Math.floor(i / trades.length) % areas.length]!; // every trade in every area
      const extraArea = areas[(Math.floor(i / trades.length) + 1) % areas.length]!;
      const sealStatus: SealStatus = i < 20 ? 'SEALED' : i < 26 ? 'IN_PROGRESS' : 'NOT_STARTED';
      const sealed = sealStatus === 'SEALED';
      const jobsCompleted = sealed ? Math.floor(rand() * 40) : 0;

      const user = await prisma.user.upsert({
        where: { phone: artisanPhone(i) },
        create: {
          phone: artisanPhone(i),
          name,
          roles: ['CLIENT', 'ARTISAN'],
          defaultAreaId: home.id,
        },
        update: {},
      });
      const profile = await prisma.artisanProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          displayName: name,
          bio: `${trade.name} specialist serving ${home.name} and environs.`,
          yearsExperience: 2 + Math.floor(rand() * 15),
          baseLat: home.lat + (rand() - 0.5) * 0.02,
          baseLng: home.lng + (rand() - 0.5) * 0.02,
          sealStatus,
          sealGrantedAt: sealed ? new Date(Date.now() - (i + 5) * 86_400_000) : null,
          ratingAvg: sealed && jobsCompleted > 0 ? Math.round((3.8 + rand() * 1.2) * 10) / 10 : 0,
          ratingCount: sealed ? Math.floor(jobsCompleted * 0.7) : 0,
          jobsCompleted,
          offersReceived: sealed ? jobsCompleted + Math.floor(rand() * 8) : 0,
          offersAccepted: sealed ? jobsCompleted + Math.floor(rand() * 3) : 0,
          avgResponseSeconds: sealed ? 300 + Math.floor(rand() * 3_300) : null,
          completionRate: sealed ? Math.round((0.85 + rand() * 0.15) * 100) / 100 : 0,
          trades: { create: [{ tradeId: trade.id, isPrimary: true }] },
          serviceAreas: { create: [{ areaId: home.id }, { areaId: extraArea.id }] },
        },
        update: {},
      });

      for (const [n, type] of CHECK_TYPES.entries()) {
        const status = sealed
          ? 'PASSED'
          : sealStatus === 'IN_PROGRESS'
            ? n < 2 // ID and license passed…
              ? 'PASSED'
              : n === 2 && i % 2 // …insurance certificate rejected for some
                ? 'FAILED'
                : 'PENDING'
            : 'PENDING';
        const decided = status !== 'PENDING';
        await prisma.verificationCheck.upsert({
          where: { artisanId_type: { artisanId: profile.id, type } },
          create: {
            artisanId: profile.id,
            type,
            status,
            reviewerId: decided ? admin.id : null,
            reviewedAt: decided ? new Date(Date.now() - (i + 10) * 86_400_000) : null,
            details:
              type === 'STATE_LICENSE' && status === 'PASSED'
                ? {
                    state: 'TX',
                    board: trade.slug === 'plumbing' ? 'TSBPE' : 'TDLR',
                    licenseNumber: `DEMO-${10000 + i}`,
                  }
                : undefined,
            notes:
              status === 'FAILED'
                ? 'Liability insurance certificate expired; asked for a renewed COI.'
                : null,
          },
          update: {},
        });
      }
    }

    // 10 clients
    const clients = [];
    for (const [i, name] of CLIENT_NAMES.entries()) {
      clients.push(
        await prisma.user.upsert({
          where: { phone: clientPhone(i) },
          create: { phone: clientPhone(i), name, roles: ['CLIENT'], defaultAreaId: pick(areas).id },
          update: {},
        }),
      );
    }

    // Open job requests waiting for assignment (later phases add jobs in other states).
    const existingJobs = await prisma.jobRequest.count({
      where: { clientId: { in: clients.map((c) => c.id) } },
    });
    if (existingJobs === 0) {
      for (const [i, j] of SAMPLE_JOBS.entries()) {
        const [{ nextval }] = await prisma.$queryRaw<
          [{ nextval: bigint }]
        >`SELECT nextval('job_ref_seq')`;
        const client = clients[i % clients.length]!;
        const preferredDate = new Date();
        preferredDate.setUTCHours(0, 0, 0, 0);
        preferredDate.setUTCDate(preferredDate.getUTCDate() + 1 + (i % 4));
        await prisma.jobRequest.create({
          data: {
            ref: `JK-${nextval}`,
            clientId: client.id,
            tradeId: bySlug(trades, j.trade).id,
            areaId: bySlug(areas, j.area).id,
            description: j.description,
            addressLine: j.address,
            postalCode: j.postalCode,
            accessNotes: j.accessNotes,
            preferredDate,
            timeWindow: pick(['MORNING', 'AFTERNOON', 'EVENING'] as const),
            statusEvents: { create: { to: 'PENDING_ASSIGNMENT', actorId: client.id } },
          },
        });
      }
    }

    const [artisans, sealed, jobs] = await Promise.all([
      prisma.artisanProfile.count(),
      prisma.artisanProfile.count({ where: { sealStatus: 'SEALED' } }),
      prisma.jobRequest.count(),
    ]);
    console.log(
      `Demo data seeded: ${artisans} artisans (${sealed} sealed), ${clients.length} clients, ${jobs} jobs`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
