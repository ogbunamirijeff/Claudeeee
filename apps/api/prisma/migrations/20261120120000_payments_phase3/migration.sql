-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "checkoutSessionId" TEXT;

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "stripeAccountId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "payments_checkoutSessionId_key" ON "payments"("checkoutSessionId");


-- A materials advance refunded under admin override is paid back from Jiko's funds, so
-- refunded + released can exceed the charged amount. Cap each total separately; escrow solvency
-- (nothing leaves escrow beyond what came in) is enforced by the ledger service.
ALTER TABLE payments DROP CONSTRAINT payments_caches_within_amount;
ALTER TABLE payments
  ADD CONSTRAINT payments_released_within_amount CHECK ("releasedCents" <= "amountCents"),
  ADD CONSTRAINT payments_refunded_within_amount CHECK ("refundedCents" <= "amountCents");
ALTER TABLE payouts ADD CONSTRAINT payouts_attempts_nonneg CHECK (attempts >= 0);
