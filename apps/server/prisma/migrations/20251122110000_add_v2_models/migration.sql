-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "depth" INTEGER NOT NULL DEFAULT 1,
    "paramsJson" JSONB,
    "summaryJson" JSONB NOT NULL,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "version" TEXT,
    "publisher" TEXT,
    "publishedAt" TIMESTAMP(3),
    "displayName" TEXT,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "friendsJson" JSONB,
    "flagsJson" JSONB,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Function" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "isEntry" BOOLEAN NOT NULL DEFAULT false,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "Function_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edge" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromNode" TEXT NOT NULL,
    "toNode" TEXT NOT NULL,
    "evidenceJson" JSONB,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "Edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Type" (
    "id" TEXT NOT NULL,
    "fqn" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "fieldsJson" JSONB,
    "hasKey" BOOLEAN NOT NULL DEFAULT false,
    "abilities" JSONB,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "Type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Object" (
    "id" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "typeFqn" TEXT NOT NULL,
    "ownerJson" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "snapshotJson" JSONB,
    "version" TEXT,
    "digest" TEXT,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "Object_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pkgAddr" TEXT,
    "modName" TEXT,
    "ts" TIMESTAMP(3),
    "tx" TEXT,
    "dataJson" JSONB,
    "sender" TEXT,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flag" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "detailsJson" JSONB,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "Flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TypeStats" (
    "id" TEXT NOT NULL,
    "typeFqn" TEXT NOT NULL,
    "count" INTEGER,
    "uniqueOwners" INTEGER,
    "sampled" INTEGER,
    "shared" INTEGER,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "TypeStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Analysis_packageId_idx" ON "Analysis"("packageId");

-- CreateIndex
CREATE INDEX "Analysis_createdAt_idx" ON "Analysis"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Package_address_key" ON "Package"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Module_fullName_key" ON "Module"("fullName");

-- CreateIndex
CREATE INDEX "Module_fullName_idx" ON "Module"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Module_packageId_name_key" ON "Module"("packageId", "name");

-- CreateIndex
CREATE INDEX "Function_moduleId_idx" ON "Function"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "Function_moduleId_name_key" ON "Function"("moduleId", "name");

-- CreateIndex
CREATE INDEX "Edge_analysisId_idx" ON "Edge"("analysisId");

-- CreateIndex
CREATE INDEX "Edge_kind_idx" ON "Edge"("kind");

-- CreateIndex
CREATE INDEX "Edge_fromNode_idx" ON "Edge"("fromNode");

-- CreateIndex
CREATE INDEX "Edge_toNode_idx" ON "Edge"("toNode");

-- CreateIndex
CREATE UNIQUE INDEX "Type_fqn_key" ON "Type"("fqn");

-- CreateIndex
CREATE INDEX "Type_moduleId_idx" ON "Type"("moduleId");

-- CreateIndex
CREATE INDEX "Type_fqn_idx" ON "Type"("fqn");

-- CreateIndex
CREATE INDEX "Type_analysisId_idx" ON "Type"("analysisId");

-- CreateIndex
CREATE INDEX "Object_objectId_idx" ON "Object"("objectId");

-- CreateIndex
CREATE INDEX "Object_typeFqn_idx" ON "Object"("typeFqn");

-- CreateIndex
CREATE INDEX "Object_analysisId_idx" ON "Object"("analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "Address_address_key" ON "Address"("address");

-- CreateIndex
CREATE INDEX "Address_address_idx" ON "Address"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Event_eventId_key" ON "Event"("eventId");

-- CreateIndex
CREATE INDEX "Event_eventId_idx" ON "Event"("eventId");

-- CreateIndex
CREATE INDEX "Event_kind_idx" ON "Event"("kind");

-- CreateIndex
CREATE INDEX "Event_pkgAddr_idx" ON "Event"("pkgAddr");

-- CreateIndex
CREATE INDEX "Event_analysisId_idx" ON "Event"("analysisId");

-- CreateIndex
CREATE INDEX "Flag_level_idx" ON "Flag"("level");

-- CreateIndex
CREATE INDEX "Flag_kind_idx" ON "Flag"("kind");

-- CreateIndex
CREATE INDEX "Flag_scope_idx" ON "Flag"("scope");

-- CreateIndex
CREATE INDEX "Flag_refId_idx" ON "Flag"("refId");

-- CreateIndex
CREATE INDEX "Flag_analysisId_idx" ON "Flag"("analysisId");

-- CreateIndex
CREATE INDEX "TypeStats_typeFqn_idx" ON "TypeStats"("typeFqn");

-- CreateIndex
CREATE INDEX "TypeStats_analysisId_idx" ON "TypeStats"("analysisId");

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Function" ADD CONSTRAINT "Function_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Type" ADD CONSTRAINT "Type_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Type" ADD CONSTRAINT "Type_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Object" ADD CONSTRAINT "Object_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypeStats" ADD CONSTRAINT "TypeStats_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
