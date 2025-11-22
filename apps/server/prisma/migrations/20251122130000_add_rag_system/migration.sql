-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create RAG schema for vector storage
CREATE SCHEMA IF NOT EXISTS rag;

-- Add explanation fields to Package table
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "explanation" TEXT;
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "explanationStatus" TEXT;
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add explanation and source fields to Module table
ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "decompiledSource" TEXT;
ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "explanation" TEXT;
ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "explanationStatus" TEXT;
ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "ultraSummary" TEXT;
ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create RAG chat tables
CREATE TABLE IF NOT EXISTS "RagChat" (
    "id" BIGSERIAL PRIMARY KEY,
    "packageId" TEXT,
    "moduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "RagChat_packageId_idx" ON "RagChat"("packageId");
CREATE INDEX IF NOT EXISTS "RagChat_moduleId_idx" ON "RagChat"("moduleId");

CREATE TABLE IF NOT EXISTS "RagMessage" (
    "id" BIGSERIAL PRIMARY KEY,
    "chatId" BIGINT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RagMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "RagChat"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "RagMessage_chatId_idx" ON "RagMessage"("chatId");
CREATE INDEX IF NOT EXISTS "RagMessage_createdAt_idx" ON "RagMessage"("createdAt");

-- Create RAG vector storage table in rag schema
CREATE TABLE IF NOT EXISTS rag.module_documents (
    id BIGSERIAL PRIMARY KEY,
    module_id TEXT NOT NULL,
    package_address TEXT NOT NULL,
    module_name TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Create indexes for rag.module_documents
CREATE INDEX IF NOT EXISTS module_documents_module_id_idx ON rag.module_documents(module_id);
CREATE INDEX IF NOT EXISTS module_documents_package_address_idx ON rag.module_documents(package_address);
CREATE INDEX IF NOT EXISTS module_documents_module_name_idx ON rag.module_documents(module_name);

-- Create vector similarity index (IVFFlat with cosine distance)
-- Note: IVFFlat requires data to be present for training
-- We'll create the index, but it might need rebuilding after initial data is inserted
CREATE INDEX IF NOT EXISTS module_documents_embedding_idx 
ON rag.module_documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create unique constraint to prevent duplicate module documents
CREATE UNIQUE INDEX IF NOT EXISTS module_documents_module_id_unique 
ON rag.module_documents(module_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION rag.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_module_documents_updated_at 
BEFORE UPDATE ON rag.module_documents 
FOR EACH ROW 
EXECUTE FUNCTION rag.update_updated_at_column();

