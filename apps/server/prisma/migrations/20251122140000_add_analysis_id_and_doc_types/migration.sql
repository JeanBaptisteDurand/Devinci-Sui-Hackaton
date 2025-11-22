-- Add analysisId to RagChat table for linking chats to analysis sessions
ALTER TABLE "RagChat" ADD COLUMN IF NOT EXISTS "analysisId" TEXT;

-- Create index for analysisId lookups
CREATE INDEX IF NOT EXISTS "RagChat_analysisId_idx" ON "RagChat"("analysisId");

-- Add doc_type column to rag.module_documents to differentiate between source code, module analysis, and package analysis
ALTER TABLE rag.module_documents ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'source';

-- Drop old unique constraint (module_id only)
DROP INDEX IF EXISTS rag.module_documents_module_id_unique;

-- Create new unique constraint (module_id + doc_type)
-- This allows multiple document types for the same module
CREATE UNIQUE INDEX IF NOT EXISTS module_documents_module_id_doc_type_unique 
ON rag.module_documents(module_id, doc_type);

-- Add index for doc_type filtering
CREATE INDEX IF NOT EXISTS module_documents_doc_type_idx ON rag.module_documents(doc_type);

