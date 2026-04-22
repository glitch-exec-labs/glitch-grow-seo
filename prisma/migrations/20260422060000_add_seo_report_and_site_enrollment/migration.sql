-- SeoReport — long-form signal-pull output from the Python agent.
-- ClientMemory — three new columns for Google-API enrollment.

-- AlterTable
ALTER TABLE "ClientMemory"
  ADD COLUMN "gscProperty" TEXT,
  ADD COLUMN "psiTargets" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "nlpTargets" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "SeoReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "siteId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "gsc" JSONB,
    "perf" JSONB,
    "entities" JSONB,
    "indexing" JSONB,
    "error" TEXT,

    CONSTRAINT "SeoReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoReport_siteId_createdAt_idx" ON "SeoReport"("siteId", "createdAt" DESC);
CREATE INDEX "SeoReport_platform_createdAt_idx" ON "SeoReport"("platform", "createdAt" DESC);
