import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { uniquePhone } from './harness';

/** Database-level guarantees that hold even if application code has a bug. */
describe('Database integrity rules', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  it('ledger entries are append-only', async () => {
    const e = await prisma.ledgerEntry.create({
      data: {
        txnId: 't1',
        debitAccount: 'PAYMENT_INFLOW',
        creditAccount: 'ESCROW',
        amountCents: 1000,
        memo: 'test',
      },
    });
    await expect(
      prisma.ledgerEntry.update({ where: { id: e.id }, data: { amountCents: 1 } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.ledgerEntry.delete({ where: { id: e.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE ledger_entries')).rejects.toThrow(
      /append-only/,
    );
  });

  it('ledger amounts are positive and move between two different accounts', async () => {
    await expect(
      prisma.ledgerEntry.create({
        data: {
          txnId: 't2',
          debitAccount: 'ESCROW',
          creditAccount: 'ARTISAN_PAYABLE',
          amountCents: -5,
          memo: 'x',
        },
      }),
    ).rejects.toThrow(/ledger_amount_positive/);
    await expect(
      prisma.ledgerEntry.create({
        data: {
          txnId: 't3',
          debitAccount: 'ESCROW',
          creditAccount: 'ESCROW',
          amountCents: 5,
          memo: 'x',
        },
      }),
    ).rejects.toThrow(/ledger_distinct_accounts/);
  });

  it('audit logs are append-only', async () => {
    const a = await prisma.auditLog.create({
      data: { action: 'test', entityType: 'X', entityId: '1' },
    });
    await expect(
      prisma.auditLog.update({ where: { id: a.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: a.id } })).rejects.toThrow(/append-only/);
  });

  it('only stores canonical US phone numbers', async () => {
    await expect(prisma.user.create({ data: { phone: '7135550123' } })).rejects.toThrow(
      /users_phone_e164_us/,
    );
  });

  it('sensitive file kinds must be marked sensitive', async () => {
    const owner = await prisma.user.create({ data: { phone: uniquePhone() } });
    await expect(
      prisma.file.create({
        data: {
          ownerId: owner.id,
          kind: 'ID_DOCUMENT',
          sensitivity: 'STANDARD',
          bucket: 'b',
          storageKey: randomUUID(),
          mimeType: 'image/jpeg',
          sizeBytes: 1,
        },
      }),
    ).rejects.toThrow(/files_sensitive_kinds/);
  });

  it('job references come from a sequence', async () => {
    const [a] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('job_ref_seq')`;
    const [b] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('job_ref_seq')`;
    expect(b.nextval - a.nextval).toBe(1n);
    expect(a.nextval).toBeGreaterThanOrEqual(1001n);
  });
});
