-- DropIndex
DROP INDEX "payments_quoteId_key";

-- CreateIndex
CREATE INDEX "payments_quoteId_idx" ON "payments"("quoteId");

