-- CreateTable
CREATE TABLE "Disassembly" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "functionsJson" JSONB NOT NULL,
    "constantsJson" JSONB NOT NULL,
    "disassemblyMethod" TEXT NOT NULL DEFAULT 'move-cli',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Disassembly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Disassembly_packageId_idx" ON "Disassembly"("packageId");

-- CreateIndex
CREATE INDEX "Disassembly_moduleName_idx" ON "Disassembly"("moduleName");

-- CreateIndex
CREATE INDEX "Disassembly_network_idx" ON "Disassembly"("network");

-- CreateIndex
CREATE UNIQUE INDEX "Disassembly_packageId_moduleName_network_key" ON "Disassembly"("packageId", "moduleName", "network");
