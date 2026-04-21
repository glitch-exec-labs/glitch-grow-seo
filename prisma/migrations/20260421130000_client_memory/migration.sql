-- Client memory: long-term brand facts per site, read by every generator.

-- CreateTable
CREATE TABLE "ClientMemory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "brandName" TEXT,
    "tagline" TEXT,
    "brandVoice" TEXT,
    "targetAudience" TEXT,
    "differentiators" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keyTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avoidTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shippingInfo" TEXT,
    "returnsInfo" TEXT,
    "sameAs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "learnedFacts" JSONB,

    CONSTRAINT "ClientMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientMemory_siteId_key" ON "ClientMemory"("siteId");
