-- Phase R1: recommendation system (RECOMMENDATION.md, TRD §14.3, ADR-068…071). Additive only:
-- new enums, two new columns with defaults, new tables. No existing data is changed.

-- CreateEnum
CREATE TYPE "FlavorTag" AS ENUM ('SPICY', 'CHEESY', 'KOREAN', 'PERI_PERI', 'ITALIAN', 'MEXICAN', 'SMOKY', 'PANEER', 'CREAMY', 'FRUITY', 'CHOCOLATE', 'COFFEE', 'MINTY');

-- CreateEnum
CREATE TYPE "MealRole" AS ENUM ('MAIN', 'SIDE', 'DRINK', 'DESSERT');

-- CreateEnum
CREATE TYPE "Daypart" AS ENUM ('LUNCH', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "RecoWindow" AS ENUM ('ALL', 'LUNCH', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "RatingSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "RecoRunStatus" AS ENUM ('TRAINING', 'ACTIVE', 'ARCHIVED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecoDataSource" AS ENUM ('DEMO_FEEDBACK', 'REAL_FEEDBACK', 'POS');

-- CreateEnum
CREATE TYPE "RecoListKind" AS ENUM ('COMPLEMENT', 'SIMILAR');

-- CreateEnum
CREATE TYPE "RecoReason" AS ENUM ('PAIRS_WITH_ROLE', 'SHARED_TAGS', 'SAME_CATEGORY', 'IN_BUDGET', 'BEST_SELLER', 'TRENDING', 'ADMIN_PICK');

-- AlterTable
ALTER TABLE "MenuCategory" ADD COLUMN     "mealRole" "MealRole" NOT NULL DEFAULT 'MAIN';

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "flavorTags" "FlavorTag"[] DEFAULT ARRAY[]::"FlavorTag"[];

-- CreateTable
CREATE TABLE "DemoVisit" (
    "id" TEXT NOT NULL,
    "visitNo" INTEGER NOT NULL,
    "demoUserNo" SMALLINT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL,
    "daypart" "Daypart" NOT NULL,
    "pattern" VARCHAR(40) NOT NULL,
    "generatorVersion" SMALLINT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoRating" (
    "id" TEXT NOT NULL,
    "feedbackNo" INTEGER NOT NULL,
    "visitId" TEXT NOT NULL,
    "demoUserNo" SMALLINT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "sentiment" "RatingSentiment" NOT NULL,
    "comment" VARCHAR(200) NOT NULL,
    "ratedAt" TIMESTAMP(3) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoModelRun" (
    "id" TEXT NOT NULL,
    "version" SERIAL NOT NULL,
    "status" "RecoRunStatus" NOT NULL DEFAULT 'TRAINING',
    "dataSource" "RecoDataSource" NOT NULL,
    "compCoocPm" SMALLINT NOT NULL,
    "compQualityPm" SMALLINT NOT NULL,
    "compContentPm" SMALLINT NOT NULL,
    "simContentPm" SMALLINT NOT NULL,
    "simTastePm" SMALLINT NOT NULL,
    "simQualityPm" SMALLINT NOT NULL,
    "ratingCount" INTEGER NOT NULL,
    "visitCount" INTEGER NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "rmse" DOUBLE PRECISION,
    "mae" DOUBLE PRECISION,
    "hitRate5Complement" DOUBLE PRECISION,
    "hitRate5Similar" DOUBLE PRECISION,
    "precision5" DOUBLE PRECISION,
    "recall5" DOUBLE PRECISION,
    "coverage" DOUBLE PRECISION,
    "baselineHitRate5" DOUBLE PRECISION,
    "gateReason" VARCHAR(200),
    "durationMs" INTEGER,
    "startedById" TEXT,
    "trainedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoModelRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemRecommendation" (
    "runId" TEXT NOT NULL,
    "fromItemId" TEXT NOT NULL,
    "toItemId" TEXT NOT NULL,
    "kind" "RecoListKind" NOT NULL,
    "rank" SMALLINT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "contentScore" DOUBLE PRECISION NOT NULL,
    "tasteScore" DOUBLE PRECISION NOT NULL,
    "coocScore" DOUBLE PRECISION NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "reasons" "RecoReason"[] DEFAULT ARRAY[]::"RecoReason"[],

    CONSTRAINT "ItemRecommendation_pkey" PRIMARY KEY ("runId","fromItemId","kind","rank")
);

-- CreateTable
CREATE TABLE "ItemPopularity" (
    "runId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "window" "RecoWindow" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ItemPopularity_pkey" PRIMARY KEY ("runId","menuItemId","window")
);

-- CreateTable
CREATE TABLE "RecoSettings" (
    "id" TEXT NOT NULL DEFAULT 'reco',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "compCoocPm" SMALLINT NOT NULL DEFAULT 600,
    "compQualityPm" SMALLINT NOT NULL DEFAULT 250,
    "compContentPm" SMALLINT NOT NULL DEFAULT 150,
    "simContentPm" SMALLINT NOT NULL DEFAULT 500,
    "simTastePm" SMALLINT NOT NULL DEFAULT 300,
    "simQualityPm" SMALLINT NOT NULL DEFAULT 200,
    "activeRunId" TEXT,
    "trainingLockUntil" TIMESTAMP(3),
    "retrainPending" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoVisit_visitNo_key" ON "DemoVisit"("visitNo");

-- CreateIndex
CREATE INDEX "DemoVisit_visitedAt_idx" ON "DemoVisit"("visitedAt");

-- CreateIndex
CREATE INDEX "DemoVisit_demoUserNo_idx" ON "DemoVisit"("demoUserNo");

-- CreateIndex
CREATE UNIQUE INDEX "DemoRating_feedbackNo_key" ON "DemoRating"("feedbackNo");

-- CreateIndex
CREATE INDEX "DemoRating_menuItemId_idx" ON "DemoRating"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoRating_demoUserNo_menuItemId_key" ON "DemoRating"("demoUserNo", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoRating_visitId_menuItemId_key" ON "DemoRating"("visitId", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoModelRun_version_key" ON "RecoModelRun"("version");

-- CreateIndex
CREATE INDEX "RecoModelRun_status_createdAt_idx" ON "RecoModelRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ItemRecommendation_toItemId_idx" ON "ItemRecommendation"("toItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemRecommendation_runId_fromItemId_kind_toItemId_key" ON "ItemRecommendation"("runId", "fromItemId", "kind", "toItemId");

-- CreateIndex
CREATE INDEX "ItemPopularity_menuItemId_idx" ON "ItemPopularity"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoSettings_activeRunId_key" ON "RecoSettings"("activeRunId");

-- AddForeignKey
ALTER TABLE "DemoRating" ADD CONSTRAINT "DemoRating_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "DemoVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoRating" ADD CONSTRAINT "DemoRating_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoModelRun" ADD CONSTRAINT "RecoModelRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRecommendation" ADD CONSTRAINT "ItemRecommendation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RecoModelRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRecommendation" ADD CONSTRAINT "ItemRecommendation_fromItemId_fkey" FOREIGN KEY ("fromItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRecommendation" ADD CONSTRAINT "ItemRecommendation_toItemId_fkey" FOREIGN KEY ("toItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPopularity" ADD CONSTRAINT "ItemPopularity_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RecoModelRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPopularity" ADD CONSTRAINT "ItemPopularity_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoSettings" ADD CONSTRAINT "RecoSettings_activeRunId_fkey" FOREIGN KEY ("activeRunId") REFERENCES "RecoModelRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------- CHECK constraints
-- `IS NOT NULL` is spelled out where needed: a CHECK that evaluates to NULL passes (ADR-039).
ALTER TABLE "MenuItem"
  ADD CONSTRAINT "MenuItem_flavor_tags_max" CHECK ("flavorTags" IS NOT NULL AND cardinality("flavorTags") <= 5);

ALTER TABLE "DemoVisit"
  ADD CONSTRAINT "DemoVisit_numbers_positive" CHECK ("visitNo" > 0 AND "demoUserNo" > 0),
  ADD CONSTRAINT "DemoVisit_pattern_not_blank" CHECK (char_length(btrim("pattern")) > 0),
  ADD CONSTRAINT "DemoVisit_is_demo" CHECK ("isDemo");

ALTER TABLE "DemoRating"
  ADD CONSTRAINT "DemoRating_numbers_positive" CHECK ("feedbackNo" > 0 AND "demoUserNo" > 0),
  ADD CONSTRAINT "DemoRating_rating_range" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "DemoRating_sentiment_matches_rating" CHECK (
    ("rating" >= 4 AND "sentiment" = 'POSITIVE') OR
    ("rating" = 3 AND "sentiment" = 'NEUTRAL') OR
    ("rating" <= 2 AND "sentiment" = 'NEGATIVE')
  ),
  ADD CONSTRAINT "DemoRating_comment_not_blank" CHECK (char_length(btrim("comment")) > 0),
  ADD CONSTRAINT "DemoRating_is_demo" CHECK ("isDemo");

ALTER TABLE "RecoModelRun"
  ADD CONSTRAINT "RecoModelRun_weights_range" CHECK (
    "compCoocPm" BETWEEN 0 AND 1000 AND "compQualityPm" BETWEEN 0 AND 1000 AND "compContentPm" BETWEEN 0 AND 1000 AND
    "simContentPm" BETWEEN 0 AND 1000 AND "simTastePm" BETWEEN 0 AND 1000 AND "simQualityPm" BETWEEN 0 AND 1000
  ),
  ADD CONSTRAINT "RecoModelRun_weights_nonzero" CHECK (
    "compCoocPm" + "compQualityPm" + "compContentPm" > 0 AND "simContentPm" + "simTastePm" + "simQualityPm" > 0
  ),
  ADD CONSTRAINT "RecoModelRun_counts_nonnegative" CHECK ("ratingCount" >= 0 AND "visitCount" >= 0 AND "itemCount" >= 0),
  ADD CONSTRAINT "RecoModelRun_metrics_range" CHECK (
    ("rmse" IS NULL OR "rmse" >= 0) AND ("mae" IS NULL OR "mae" >= 0) AND
    ("hitRate5Complement" IS NULL OR "hitRate5Complement" BETWEEN 0 AND 1) AND
    ("hitRate5Similar" IS NULL OR "hitRate5Similar" BETWEEN 0 AND 1) AND
    ("precision5" IS NULL OR "precision5" BETWEEN 0 AND 1) AND
    ("recall5" IS NULL OR "recall5" BETWEEN 0 AND 1) AND
    ("coverage" IS NULL OR "coverage" BETWEEN 0 AND 1) AND
    ("baselineHitRate5" IS NULL OR "baselineHitRate5" BETWEEN 0 AND 1) AND
    ("durationMs" IS NULL OR "durationMs" >= 0)
  );

ALTER TABLE "ItemRecommendation"
  ADD CONSTRAINT "ItemRecommendation_not_self" CHECK ("fromItemId" <> "toItemId"),
  ADD CONSTRAINT "ItemRecommendation_rank_range" CHECK ("rank" BETWEEN 1 AND 10),
  ADD CONSTRAINT "ItemRecommendation_scores_range" CHECK (
    "score" BETWEEN 0 AND 1 AND "contentScore" BETWEEN 0 AND 1 AND "tasteScore" BETWEEN 0 AND 1 AND
    "coocScore" BETWEEN 0 AND 1 AND "qualityScore" BETWEEN 0 AND 1
  );

ALTER TABLE "ItemPopularity"
  ADD CONSTRAINT "ItemPopularity_score_range" CHECK ("score" BETWEEN 0 AND 1);

ALTER TABLE "RecoSettings"
  ADD CONSTRAINT "RecoSettings_singleton" CHECK ("id" = 'reco'),
  ADD CONSTRAINT "RecoSettings_weights_range" CHECK (
    "compCoocPm" BETWEEN 0 AND 1000 AND "compQualityPm" BETWEEN 0 AND 1000 AND "compContentPm" BETWEEN 0 AND 1000 AND
    "simContentPm" BETWEEN 0 AND 1000 AND "simTastePm" BETWEEN 0 AND 1000 AND "simQualityPm" BETWEEN 0 AND 1000
  ),
  ADD CONSTRAINT "RecoSettings_weights_nonzero" CHECK (
    "compCoocPm" + "compQualityPm" + "compContentPm" > 0 AND "simContentPm" + "simTastePm" + "simQualityPm" > 0
  );

-- ---------------------------------------------------------------- RLS deny-all (ADR-009)
-- Same rule as `*_security_rls`: RLS on, no policies, and no privileges for the Supabase API roles.
ALTER TABLE "DemoVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DemoRating" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecoModelRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ItemRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ItemPopularity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecoSettings" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON "DemoVisit", "DemoRating", "RecoModelRun", "ItemRecommendation", "ItemPopularity", "RecoSettings" FROM %I', r);
      EXECUTE format('REVOKE ALL ON SEQUENCE "RecoModelRun_version_seq" FROM %I', r);
    END IF;
  END LOOP;
END $$;
