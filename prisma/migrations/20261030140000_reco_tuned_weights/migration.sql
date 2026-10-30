-- Phase R3: RecoSettings weight defaults = the weights tuned on validation in the R2 notebook (ADR-074).
-- Only column defaults change; no data is changed (RecoSettings has no row until the first training run).
-- AlterTable
ALTER TABLE "RecoSettings" ALTER COLUMN "compCoocPm" SET DEFAULT 500,
ALTER COLUMN "compQualityPm" SET DEFAULT 0,
ALTER COLUMN "compContentPm" SET DEFAULT 500,
ALTER COLUMN "simTastePm" SET DEFAULT 200,
ALTER COLUMN "simQualityPm" SET DEFAULT 300;

