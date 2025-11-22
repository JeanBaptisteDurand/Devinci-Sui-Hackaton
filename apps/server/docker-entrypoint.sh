#!/bin/sh
set -e

echo "🚀 Starting SuiLens Server..."

cd /app/apps/server

# Set PostgreSQL password for psql commands
export PGPASSWORD=suilens_dev_password

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
until pg_isready -h postgres -U suilens -d suilens > /dev/null 2>&1; do
  echo "   PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "✅ PostgreSQL is ready!"

# Sync the Prisma schema to the database (creates/updates tables)
echo "🔄 Syncing database schema..."
pnpm prisma db push --accept-data-loss --skip-generate || {
  echo "⚠️  Schema sync had issues, but continuing..."
}

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
pnpm prisma generate

# Check if pgvector extension is enabled
echo "🧠 Checking pgvector extension..."
PGVECTOR_EXISTS=$(psql -h postgres -U suilens -d suilens -tAc "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector');")

if [ "$PGVECTOR_EXISTS" = "f" ]; then
  echo "📦 Enabling pgvector extension..."
  psql -h postgres -U suilens -d suilens -c "CREATE EXTENSION IF NOT EXISTS vector;"
  echo "✅ pgvector extension enabled!"
else
  echo "✅ pgvector extension already enabled"
fi

# Check if rag schema and table exist
echo "🔍 Checking RAG tables..."
RAG_SCHEMA_EXISTS=$(psql -h postgres -U suilens -d suilens -tAc "SELECT EXISTS (SELECT FROM information_schema.schemata WHERE schema_name = 'rag');")

if [ "$RAG_SCHEMA_EXISTS" = "f" ]; then
  echo "📦 Creating RAG schema and tables..."
  psql -h postgres -U suilens -d suilens -c "CREATE SCHEMA IF NOT EXISTS rag;"
fi

RAG_TABLE_EXISTS=$(psql -h postgres -U suilens -d suilens -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'rag' AND table_name = 'module_documents');")

if [ "$RAG_TABLE_EXISTS" = "f" ]; then
  echo "📦 Creating rag.module_documents table..."
  psql -h postgres -U suilens -d suilens <<-EOSQL
    CREATE TABLE IF NOT EXISTS rag.module_documents (
        id BIGSERIAL PRIMARY KEY,
        module_id TEXT NOT NULL,
        package_address TEXT NOT NULL,
        module_name TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        doc_type TEXT NOT NULL DEFAULT 'source',
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS module_documents_module_id_idx ON rag.module_documents(module_id);
    CREATE INDEX IF NOT EXISTS module_documents_package_address_idx ON rag.module_documents(package_address);
    CREATE INDEX IF NOT EXISTS module_documents_module_name_idx ON rag.module_documents(module_name);
    CREATE INDEX IF NOT EXISTS module_documents_doc_type_idx ON rag.module_documents(doc_type);
    
    -- Updated unique constraint to include doc_type
    CREATE UNIQUE INDEX IF NOT EXISTS module_documents_module_id_doc_type_unique 
    ON rag.module_documents(module_id, doc_type);
    
    -- Create vector similarity index (IVFFlat with cosine distance)
    CREATE INDEX IF NOT EXISTS module_documents_embedding_idx 
    ON rag.module_documents 
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

    -- Add trigger to update updated_at timestamp
    CREATE OR REPLACE FUNCTION rag.update_updated_at_column()
    RETURNS TRIGGER AS \$\$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    \$\$ language 'plpgsql';

    CREATE TRIGGER update_module_documents_updated_at 
    BEFORE UPDATE ON rag.module_documents 
    FOR EACH ROW 
    EXECUTE FUNCTION rag.update_updated_at_column();
EOSQL
  echo "✅ RAG tables created!"
else
  echo "✅ RAG tables already exist"
  
  # Ensure doc_type column exists (for existing tables)
  echo "🔄 Ensuring doc_type column exists..."
  psql -h postgres -U suilens -d suilens <<-EOSQL
    ALTER TABLE rag.module_documents ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'source';
    DROP INDEX IF EXISTS rag.module_documents_module_id_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS module_documents_module_id_doc_type_unique 
    ON rag.module_documents(module_id, doc_type);
    CREATE INDEX IF NOT EXISTS module_documents_doc_type_idx ON rag.module_documents(doc_type);
EOSQL
fi

echo ""
echo "✅ Database setup complete!"
echo "🚀 Starting development server with hot reload..."
echo ""

# Start the development server
exec pnpm dev
