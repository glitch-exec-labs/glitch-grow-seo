-- Glitch Grow AI SEO Agent — v0 core schema.
--
-- Adds the three agent tables (AgentRun, AgentMemory, SiteConnection)
-- and enables pgvector so AgentMemory.embedding can store
-- text-embedding-3-small output for hybrid retrieval.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "siteId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "signals" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "plannerModel" TEXT,
    "plannerSkipped" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "siteId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "signals" JSONB,
    "findings" JSONB,
    "metrics" JSONB,
    "embedding" vector(1536),

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteConnection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "platform" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "label" TEXT,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SiteConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_siteId_createdAt_idx" ON "AgentRun"("siteId", "createdAt" DESC);
CREATE INDEX "AgentRun_platform_createdAt_idx" ON "AgentRun"("platform", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AgentMemory_siteId_createdAt_idx" ON "AgentMemory"("siteId", "createdAt" DESC);
CREATE INDEX "AgentMemory_siteId_kind_idx" ON "AgentMemory"("siteId", "kind");

-- Vector index for hybrid retrieval. HNSW performs well up to millions of rows.
CREATE INDEX "AgentMemory_embedding_hnsw" ON "AgentMemory"
  USING hnsw (embedding vector_cosine_ops);

-- CreateIndex
CREATE UNIQUE INDEX "SiteConnection_siteId_key" ON "SiteConnection"("siteId");
CREATE INDEX "SiteConnection_platform_idx" ON "SiteConnection"("platform");
