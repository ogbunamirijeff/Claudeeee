-- Integrity rules Prisma's schema language can't express.
-- Column names are camelCase (Prisma default), so they're quoted.

-- ─── Money: non-negative integer kobo, internally consistent ─────────────────
ALTER TABLE quotes
  ADD CONSTRAINT quotes_amounts_nonneg CHECK ("labourKobo" >= 0 AND "materialsKobo" >= 0 AND "commissionKobo" >= 0),
  ADD CONSTRAINT quotes_total_sum CHECK ("totalKobo" = "labourKobo" + "materialsKobo"),
  ADD CONSTRAINT quotes_payout_sum CHECK ("artisanPayoutKobo" = "totalKobo" - "commissionKobo"),
  -- Materials are advanced in full at job start, so labour must cover all commission.
  ADD CONSTRAINT quotes_labour_covers_commission CHECK ("commissionKobo" <= "labourKobo"),
  ADD CONSTRAINT quotes_bps_range CHECK ("commissionBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT quotes_version_positive CHECK (version >= 1);

ALTER TABLE quote_items
  ADD CONSTRAINT quote_items_qty_positive CHECK (quantity > 0),
  ADD CONSTRAINT quote_items_price_nonneg CHECK ("unitPriceKobo" >= 0),
  ADD CONSTRAINT quote_items_total CHECK ("totalKobo" = quantity * "unitPriceKobo");

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive CHECK ("amountKobo" > 0),
  ADD CONSTRAINT payments_caches_nonneg CHECK ("refundedKobo" >= 0 AND "releasedKobo" >= 0),
  ADD CONSTRAINT payments_caches_within_amount CHECK ("refundedKobo" + "releasedKobo" <= "amountKobo"),
  ADD CONSTRAINT payments_fees_nonneg CHECK ("feesKobo" IS NULL OR "feesKobo" >= 0),
  ADD CONSTRAINT payments_currency_ngn CHECK (currency = 'NGN');

ALTER TABLE payouts
  ADD CONSTRAINT payouts_amount_positive CHECK ("amountKobo" > 0),
  ADD CONSTRAINT payouts_fee_nonneg CHECK ("feeKobo" IS NULL OR "feeKobo" >= 0);

ALTER TABLE refunds
  ADD CONSTRAINT refunds_amount_positive CHECK ("amountKobo" > 0),
  ADD CONSTRAINT refunds_override_needs_reason CHECK (NOT "includesMaterialsAdvance" OR "overrideReason" IS NOT NULL);

ALTER TABLE disputes
  ADD CONSTRAINT disputes_refund_nonneg CHECK ("refundKobo" IS NULL OR "refundKobo" >= 0);

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_amount_positive CHECK ("amountKobo" > 0),
  ADD CONSTRAINT ledger_distinct_accounts CHECK ("debitAccount" <> "creditAccount");

-- ─── Other data rules ────────────────────────────────────────────────────────
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);

ALTER TABLE users ADD CONSTRAINT users_phone_e164_ng
  CHECK (status = 'DELETED' OR phone ~ '^\+234[789][01][0-9]{8}$');

ALTER TABLE artisan_profiles
  ADD CONSTRAINT artisan_last4_digits CHECK ("accountNumberLast4" IS NULL OR "accountNumberLast4" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT artisan_rating_range CHECK ("ratingAvg" BETWEEN 0 AND 5);

ALTER TABLE verification_checks ADD CONSTRAINT verification_decided_has_reviewer
  CHECK (status = 'PENDING' OR ("reviewerId" IS NOT NULL AND "reviewedAt" IS NOT NULL));

ALTER TABLE files ADD CONSTRAINT files_sensitive_kinds
  CHECK (("kind" IN ('ID_DOCUMENT', 'VERIFICATION_EVIDENCE')) = (sensitivity = 'SENSITIVE'));

-- ─── One live row per job ────────────────────────────────────────────────────
CREATE UNIQUE INDEX assignments_one_active_per_job ON assignments ("jobId") WHERE status IN ('OFFERED', 'ACCEPTED');
CREATE UNIQUE INDEX quotes_one_live_per_job ON quotes ("jobId") WHERE status IN ('SUBMITTED', 'APPROVED');
CREATE UNIQUE INDEX disputes_one_open_per_job ON disputes ("jobId") WHERE status <> 'RESOLVED';
CREATE UNIQUE INDEX payments_one_live_per_job ON payments ("jobId") WHERE status NOT IN ('FAILED', 'ABANDONED');

-- ─── Append-only tables ──────────────────────────────────────────────────────
CREATE FUNCTION jiko_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION jiko_forbid_mutation();
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION jiko_forbid_mutation();

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION jiko_forbid_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION jiko_forbid_mutation();

CREATE TRIGGER job_status_events_append_only BEFORE UPDATE OR DELETE ON job_status_events
  FOR EACH ROW EXECUTE FUNCTION jiko_forbid_mutation();

-- ─── Human-friendly job references: JK-1001, JK-1002, … ──────────────────────
CREATE SEQUENCE job_ref_seq START 1001;
