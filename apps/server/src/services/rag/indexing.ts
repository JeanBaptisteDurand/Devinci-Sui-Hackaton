import prisma from '../../prismaClient.js';
import { logger } from '../../logger.js';
import { generateEmbedding } from '../openai.js';
import { 
  upsertRagDocument, 
  getRagDocumentCount, 
  getRagDocumentByModuleId,
  upsertPackageAnalysis 
} from '../db.js';
import { getModuleSourceCode } from '../../sourceCode.js';
import type { Network } from '../../sui.js';

/**
 * Generate structured text document for a module
 * This document will be used for RAG embeddings
 */
function generateModuleDocument(params: {
  packageAddress: string;
  moduleName: string;
  sourceCode: string;
  functions: Array<{ name: string; visibility: string }>;
}): string {
  const { packageAddress, moduleName, sourceCode, functions } = params;

  // Extract structs from source code (simple regex-based extraction)
  const structs: string[] = [];
  const structMatches = sourceCode.matchAll(/struct\s+(\w+)(?:<[^>]+>)?\s*(?:has\s+([^{]+))?\s*{([^}]*)}/gs);
  for (const match of structMatches) {
    structs.push(match[1]);
  }

  // Extract entry functions
  const entryFunctions = functions
    .filter(f => f.visibility === 'entry' || f.visibility.includes('entry'))
    .map(f => f.name);

  // Extract public functions
  const publicFunctions = functions
    .filter(f => f.visibility === 'public' || f.visibility.includes('public'))
    .map(f => f.name);

  // Build structured document
  const doc = `
MODULE: ${packageAddress}::${moduleName}

METADATA:
- Package Address: ${packageAddress}
- Module Name: ${moduleName}
- Entry Functions: ${entryFunctions.length > 0 ? entryFunctions.join(', ') : 'none'}
- Public Functions: ${publicFunctions.length > 0 ? publicFunctions.join(', ') : 'none'}
- Structs: ${structs.length > 0 ? structs.join(', ') : 'none'}

DECOMPILED SOURCE CODE:
${sourceCode}
`.trim();

  return doc;
}

/**
 * Index a single module for RAG
 */
export async function indexModuleForRag(
  moduleId: string,
  options: { force?: boolean } = {}
): Promise<{ indexed: boolean; alreadyExists: boolean }> {
  const { force = false } = options;
  
  logger.info('rag-indexing', `Starting indexing for module ${moduleId}`, { force });

  try {
    // Check if module is already indexed (unless force=true)
    if (!force) {
      const existingDoc = await getRagDocumentByModuleId(moduleId);
      if (existingDoc) {
        logger.info('rag-indexing', `💾 Module ${moduleId} already indexed, skipping (use force=true to reindex)`);
        return { indexed: false, alreadyExists: true };
      }
    }

    // Get module from database
    const module = await prisma.module.findUnique({
      where: { id: moduleId },
      include: {
        package: true,
        functions: true,
      },
    });

    if (!module) {
      throw new Error(`Module ${moduleId} not found`);
    }

    const packageAddress = module.package.address;
    const moduleName = module.name;

    // Get source code (try from Module.decompiledSource first, then fetch)
    let sourceCode = module.decompiledSource;
    
    if (!sourceCode) {
      logger.info('rag-indexing', `Fetching source code for ${packageAddress}::${moduleName}`);
      
      // Determine network (default to mainnet)
      const network: Network = 'mainnet'; // TODO: Get from analysis or package metadata
      
      try {
        const moduleSource = await getModuleSourceCode(packageAddress, moduleName, network);
        sourceCode = moduleSource.sourceCode;
        
        // Update module with decompiled source
        await prisma.module.update({
          where: { id: moduleId },
          data: { decompiledSource: sourceCode },
        });
      } catch (error: any) {
        logger.error('rag-indexing', `Failed to fetch source code for ${packageAddress}::${moduleName}`, {
          error: error.message,
        });
        // If we can't get source code, we can't index
        throw error;
      }
    }

    // Generate structured document
    const document = generateModuleDocument({
      packageAddress,
      moduleName,
      sourceCode,
      functions: module.functions.map(f => ({
        name: f.name,
        visibility: f.visibility,
      })),
    });

    logger.debug('rag-indexing', `Generated document for ${packageAddress}::${moduleName} (${document.length} chars)`);

    // Generate embedding
    const embedding = await generateEmbedding(document);

    logger.debug('rag-indexing', `Generated embedding for ${packageAddress}::${moduleName}`);

    // Upsert to rag.module_documents
    await upsertRagDocument({
      moduleId,
      packageAddress,
      moduleName,
      content: document,
      embedding,
      docType: 'source',
    });

    logger.info('rag-indexing', `✅ Successfully indexed module ${packageAddress}::${moduleName}`);
    return { indexed: true, alreadyExists: false };
  } catch (error: any) {
    logger.error('rag-indexing', `Failed to index module ${moduleId}`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Index module LLM analysis in vector DB
 */
export async function indexModuleAnalysis(
  moduleId: string,
  options: { force?: boolean } = {}
): Promise<{ indexed: boolean; alreadyExists: boolean }> {
  const { force = false } = options;

  logger.info('rag-indexing', `Indexing module analysis for ${moduleId}`, { force });

  try {
    // Check if already indexed
    if (!force) {
      const existingDoc = await getRagDocumentByModuleId(moduleId, 'module_analysis');
      if (existingDoc) {
        logger.info('rag-indexing', `Module analysis ${moduleId} already indexed, skipping`);
        return { indexed: false, alreadyExists: true };
      }
    }

    // Get module from database
    const module = await prisma.module.findUnique({
      where: { id: moduleId },
      include: {
        package: true,
      },
    });

    if (!module) {
      throw new Error(`Module ${moduleId} not found`);
    }

    if (!module.explanation) {
      logger.warn('rag-indexing', `Module ${moduleId} has no explanation, skipping`);
      return { indexed: false, alreadyExists: false };
    }

    const packageAddress = module.package.address;
    const moduleName = module.name;

    // Build document content
    const document = `
MODULE ANALYSIS: ${packageAddress}::${moduleName}

${module.explanation}

${module.ultraSummary ? `\nSUMMARY: ${module.ultraSummary}` : ''}
`.trim();

    // Generate embedding
    const embedding = await generateEmbedding(document);

    // Upsert to rag.module_documents
    await upsertRagDocument({
      moduleId,
      packageAddress,
      moduleName,
      content: document,
      embedding,
      docType: 'module_analysis',
    });

    logger.info('rag-indexing', `✅ Successfully indexed module analysis for ${packageAddress}::${moduleName}`);
    return { indexed: true, alreadyExists: false };
  } catch (error: any) {
    logger.error('rag-indexing', `Failed to index module analysis ${moduleId}`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Reindex all modules
 */
export async function reindexAllModules(options: {
  batchSize?: number;
  onProgress?: (current: number, total: number) => void;
} = {}): Promise<{ indexed: number; failed: number }> {
  const { batchSize = 10, onProgress } = options;

  logger.info('rag-indexing', 'Starting reindex of all modules');

  try {
    // Get all modules
    const modules = await prisma.module.findMany({
      select: { id: true },
    });

    const total = modules.length;
    let indexed = 0;
    let failed = 0;

    logger.info('rag-indexing', `Found ${total} modules to index`);

    // Process in batches
    for (let i = 0; i < modules.length; i += batchSize) {
      const batch = modules.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (module) => {
          try {
            await indexModuleForRag(module.id);
            indexed++;
          } catch (error: any) {
            logger.error('rag-indexing', `Failed to index module ${module.id}`, {
              error: error.message,
            });
            failed++;
          }

          if (onProgress) {
            onProgress(indexed + failed, total);
          }
        })
      );

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < modules.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const finalCount = await getRagDocumentCount();

    logger.info('rag-indexing', `Reindexing complete: ${indexed} indexed, ${failed} failed, ${finalCount} total documents`);

    return { indexed, failed };
  } catch (error: any) {
    logger.error('rag-indexing', 'Failed to reindex modules', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Index all modules in a specific package
 */
export async function indexPackageModules(packageId: string): Promise<{ indexed: number; failed: number }> {
  logger.info('rag-indexing', `Starting indexing for package ${packageId}`);

  try {
    const modules = await prisma.module.findMany({
      where: { packageId },
      select: { id: true },
    });

    let indexed = 0;
    let failed = 0;

    for (const module of modules) {
      try {
        await indexModuleForRag(module.id);
        indexed++;
      } catch (error: any) {
        logger.error('rag-indexing', `Failed to index module ${module.id}`, {
          error: error.message,
        });
        failed++;
      }
    }

    logger.info('rag-indexing', `Package indexing complete: ${indexed} indexed, ${failed} failed`);

    return { indexed, failed };
  } catch (error: any) {
    logger.error('rag-indexing', `Failed to index package ${packageId}`, {
      error: error.message,
    });
    throw error;
  }
}

