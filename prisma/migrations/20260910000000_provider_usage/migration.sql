-- Provider quota metering. Every external plan in use is a free plan, so each billable
-- call is counted per window and capped before it is spent.
CREATE TABLE "ProviderUsage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderUsage_provider_period_key" ON "ProviderUsage"("provider", "period");
CREATE INDEX "ProviderUsage_provider_idx" ON "ProviderUsage"("provider");
