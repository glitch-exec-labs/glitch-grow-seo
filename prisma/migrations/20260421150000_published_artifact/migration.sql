-- Published artifacts — concrete applyEdit() output for non-Shopify sites.

-- CreateTable
CREATE TABLE "PublishedArtifact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "rationale" TEXT,

    CONSTRAINT "PublishedArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishedArtifact_siteId_scope_pageKey_kind_key_key"
  ON "PublishedArtifact"("siteId", "scope", "pageKey", "kind", "key");
CREATE INDEX "PublishedArtifact_siteId_scope_pageKey_idx"
  ON "PublishedArtifact"("siteId", "scope", "pageKey");
