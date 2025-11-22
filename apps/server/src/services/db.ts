import prisma from '../prismaClient.js';
import { logger } from '../logger.js';

/**
 * Database utilities for RAG system
 * Note: rag.module_documents is not in Prisma schema (uses vector type)
 * so we use raw SQL queries for that table
 */

export interface RagDocument {
  id: bigint;
  module_id: string;
  package_address: string;
  module_name: string;
  content: string;
  doc_type: 'source' | 'module_analysis' | 'package_analysis'; // Type of document
  embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface RagSearchResult {
  id: bigint;
  module_id: string;
  package_address: string;
  module_name: string;
  content: string;
  doc_type: 'source' | 'module_analysis' | 'package_analysis';
  similarity: number;
}

/**
 * Insert or update a RAG document
 */
export async function upsertRagDocument(params: {
  moduleId: string;
  packageAddress: string;
  moduleName: string;
  content: string;
  embedding: number[];
  docType?: 'source' | 'module_analysis' | 'package_analysis';
}): Promise<void> {
  const { moduleId, packageAddress, moduleName, content, embedding, docType = 'source' } = params;

  // Convert embedding array to pgvector format string
  const embeddingStr = `[${embedding.join(',')}]`;

  try {
    await prisma.$executeRaw`
      INSERT INTO rag.module_documents (module_id, package_address, module_name, content, doc_type, embedding)
      VALUES (${moduleId}, ${packageAddress}, ${moduleName}, ${content}, ${docType}, ${embeddingStr}::vector)
      ON CONFLICT (module_id, doc_type)
      DO UPDATE SET
        package_address = EXCLUDED.package_address,
        module_name = EXCLUDED.module_name,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        updated_at = now()
    `;

    logger.info('db', `Upserted RAG document for module ${moduleId} (type: ${docType})`);
  } catch (error: any) {
    logger.error('db', `Failed to upsert RAG document for module ${moduleId}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Search for similar documents using vector similarity
 */
export async function searchSimilarDocuments(params: {
  embedding: number[];
  limit?: number;
  packageAddress?: string;
  docTypes?: Array<'source' | 'module_analysis' | 'package_analysis'>;
}): Promise<RagSearchResult[]> {
  const { embedding, limit = 5, packageAddress, docTypes } = params;

  const embeddingStr = `[${embedding.join(',')}]`;

  try {
    // First, let's check what's in the DB
    if (packageAddress) {
      const allDocs = await prisma.$queryRaw<any[]>`
        SELECT module_id, package_address, module_name, doc_type
        FROM rag.module_documents
        WHERE package_address = ${packageAddress}
      `;
      logger.info('db', `📊 Documents in DB for package ${packageAddress}:`, {
        count: allDocs.length,
        docs: allDocs,
      });
    }

    // Also check total count
    const totalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM rag.module_documents
    `;
    logger.info('db', `📊 Total RAG documents in DB: ${Number(totalCount[0].count)}`);

    let results: any[];

    // Handle doc type filtering
    if (packageAddress && docTypes && docTypes.length > 0) {
      // Search within a specific package with doc type filter
      const query = `
        SELECT 
          id,
          module_id,
          package_address,
          module_name,
          content,
          doc_type,
          1 - (embedding <=> $1::vector) as similarity
        FROM rag.module_documents
        WHERE package_address = $2 AND doc_type = ANY($3::text[])
        ORDER BY embedding <=> $1::vector
        LIMIT $4
      `;
      results = await prisma.$queryRawUnsafe(query, embeddingStr, packageAddress, docTypes, limit);
      logger.info('db', `🔍 Vector search with package and doc type filter`, {
        packageAddress,
        docTypes,
        resultsCount: results.length,
      });
    } else if (packageAddress) {
      // Search within a specific package (all doc types)
      const query = `
        SELECT 
          id,
          module_id,
          package_address,
          module_name,
          content,
          doc_type,
          1 - (embedding <=> $1::vector) as similarity
        FROM rag.module_documents
        WHERE package_address = $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3
      `;
      results = await prisma.$queryRawUnsafe(query, embeddingStr, packageAddress, limit);
      logger.info('db', `🔍 Vector search with package filter`, {
        packageAddress,
        resultsCount: results.length,
      });
    } else if (docTypes && docTypes.length > 0) {
      // Search across all packages with doc type filter
      const query = `
        SELECT 
          id,
          module_id,
          package_address,
          module_name,
          content,
          doc_type,
          1 - (embedding <=> $1::vector) as similarity
        FROM rag.module_documents
        WHERE doc_type = ANY($2::text[])
        ORDER BY embedding <=> $1::vector
        LIMIT $3
      `;
      results = await prisma.$queryRawUnsafe(query, embeddingStr, docTypes, limit);
      logger.info('db', `🔍 Vector search with doc type filter`, {
        docTypes,
        resultsCount: results.length,
      });
    } else {
      // Search across all packages (all doc types)
      const query = `
        SELECT 
          id,
          module_id,
          package_address,
          module_name,
          content,
          doc_type,
          1 - (embedding <=> $1::vector) as similarity
        FROM rag.module_documents
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `;
      results = await prisma.$queryRawUnsafe(query, embeddingStr, limit);
      logger.info('db', `🔍 Vector search without filters`, {
        resultsCount: results.length,
      });
    }

    logger.debug('db', `Found ${results.length} similar documents`);

    return results.map((row: any) => ({
      id: row.id,
      module_id: row.module_id,
      package_address: row.package_address,
      module_name: row.module_name,
      content: row.content,
      doc_type: row.doc_type,
      similarity: parseFloat(row.similarity),
    }));
  } catch (error: any) {
    logger.error('db', 'Failed to search similar documents', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get RAG document by module ID and doc type
 */
export async function getRagDocumentByModuleId(
  moduleId: string,
  docType: 'source' | 'module_analysis' | 'package_analysis' = 'source'
): Promise<RagDocument | null> {
  try {
    const results = await prisma.$queryRaw<RagDocument[]>`
      SELECT 
        id,
        module_id,
        package_address,
        module_name,
        content,
        doc_type,
        embedding::text as embedding,
        created_at,
        updated_at
      FROM rag.module_documents
      WHERE module_id = ${moduleId} AND doc_type = ${docType}
      LIMIT 1
    `;

    if (results.length === 0) {
      return null;
    }

    return results[0];
  } catch (error: any) {
    logger.error('db', `Failed to get RAG document for module ${moduleId}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Delete RAG document by module ID and optional doc type
 */
export async function deleteRagDocument(
  moduleId: string,
  docType?: 'source' | 'module_analysis' | 'package_analysis'
): Promise<void> {
  try {
    if (docType) {
      await prisma.$executeRaw`
        DELETE FROM rag.module_documents
        WHERE module_id = ${moduleId} AND doc_type = ${docType}
      `;
      logger.info('db', `Deleted RAG document for module ${moduleId} (type: ${docType})`);
    } else {
      await prisma.$executeRaw`
        DELETE FROM rag.module_documents
        WHERE module_id = ${moduleId}
      `;
      logger.info('db', `Deleted all RAG documents for module ${moduleId}`);
    }
  } catch (error: any) {
    logger.error('db', `Failed to delete RAG document for module ${moduleId}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get total count of RAG documents
 */
export async function getRagDocumentCount(): Promise<number> {
  try {
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM rag.module_documents
    `;

    return Number(result[0].count);
  } catch (error: any) {
    logger.error('db', 'Failed to get RAG document count', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Upsert package analysis to vector DB
 * Stores using a special module_id format: "PKG:{packageAddress}"
 */
export async function upsertPackageAnalysis(params: {
  packageId: string;
  packageAddress: string;
  content: string;
  embedding: number[];
}): Promise<void> {
  const { packageId, packageAddress, content, embedding } = params;
  const moduleId = `PKG:${packageAddress}`; // Special ID for package-level docs

  await upsertRagDocument({
    moduleId,
    packageAddress,
    moduleName: '__package__',
    content,
    embedding,
    docType: 'package_analysis',
  });

  logger.info('db', `Upserted package analysis for ${packageAddress}`);
}

/**
 * Get package analysis from vector DB
 */
export async function getPackageAnalysis(packageAddress: string): Promise<RagDocument | null> {
  const moduleId = `PKG:${packageAddress}`;
  return await getRagDocumentByModuleId(moduleId, 'package_analysis');
}

