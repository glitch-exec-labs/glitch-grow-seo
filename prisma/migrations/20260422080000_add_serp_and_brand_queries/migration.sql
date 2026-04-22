-- SERP snapshots + brand-query enrollment.

-- AlterTable
ALTER TABLE "ClientMemory"
  ADD COLUMN "brandQueries" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SeoReport"
  ADD COLUMN "serp" JSONB;
