import { HttpStatus, Injectable } from '@nestjs/common';
import type { LedgerAccount } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppException } from '../../common/http/app-exception';
import type { Tx } from '../../prisma/prisma.service';

export interface LedgerLine {
  from: LedgerAccount; // debited
  to: LedgerAccount; // credited
  amountCents: number;
  memo: string;
}

export interface LedgerRefs {
  jobId: string;
  paymentId: string;
  payoutId?: string;
  refundId?: string;
  actorId?: string | null;
}

export interface PaymentTotals {
  capturedCents: number;
  /** Moved out of escrow to the pro (payable) or to Jiko (commission). */
  releasedCents: number;
  /** Returned to the client, from escrow or (admin override) from Jiko's funds. */
  refundedCents: number;
  escrowCents: number;
}

/**
 * Append-only double-entry ledger. Every money movement is a line "from → to"; rows are never
 * updated or deleted (DB trigger), corrections are new reversing lines.
 *
 * Payment.releasedCents / refundedCents are caches of ledger-derived totals and are only ever
 * written here, inside the same transaction as the lines that change them.
 */
@Injectable()
export class LedgerService {
  async post(tx: Tx, refs: LedgerRefs, lines: LedgerLine[]): Promise<PaymentTotals> {
    const txnId = randomUUID();
    const rows = lines.filter((l) => l.amountCents > 0);
    if (rows.length) {
      await tx.ledgerEntry.createMany({
        data: rows.map((l) => ({
          txnId,
          debitAccount: l.from,
          creditAccount: l.to,
          amountCents: l.amountCents,
          memo: l.memo,
          jobId: refs.jobId,
          paymentId: refs.paymentId,
          payoutId: refs.payoutId ?? null,
          refundId: refs.refundId ?? null,
          createdById: refs.actorId ?? null,
        })),
      });
    }
    const totals = await this.totals(tx, refs.paymentId);
    if (totals.escrowCents < 0) {
      // Never let more leave escrow than came in; the whole transaction rolls back.
      throw new AppException(
        HttpStatus.CONFLICT,
        'ESCROW_INSUFFICIENT',
        'Not enough held funds for this movement',
      );
    }
    await tx.payment.update({
      where: { id: refs.paymentId },
      data: { releasedCents: totals.releasedCents, refundedCents: totals.refundedCents },
    });
    return totals;
  }

  /** Derives a payment's totals from its ledger lines (the source of truth). */
  async totals(tx: Tx, paymentId: string): Promise<PaymentTotals> {
    const rows = await tx.ledgerEntry.groupBy({
      by: ['debitAccount', 'creditAccount'],
      where: { paymentId },
      _sum: { amountCents: true },
    });
    const sum = (from: LedgerAccount | '*', to: LedgerAccount | '*') =>
      rows
        .filter(
          (r) =>
            (from === '*' || r.debitAccount === from) && (to === '*' || r.creditAccount === to),
        )
        .reduce((a, r) => a + (r._sum.amountCents ?? 0), 0);
    return {
      capturedCents: sum('PAYMENT_INFLOW', 'ESCROW'),
      releasedCents:
        sum('ESCROW', 'ARTISAN_PAYABLE') +
        sum('ESCROW', 'PLATFORM_COMMISSION') -
        sum('ARTISAN_PAYABLE', 'ESCROW') -
        sum('PLATFORM_COMMISSION', 'ESCROW'),
      refundedCents: sum('*', 'CLIENT_REFUNDED') - sum('CLIENT_REFUNDED', '*'),
      escrowCents: sum('*', 'ESCROW') - sum('ESCROW', '*'),
    };
  }
}
