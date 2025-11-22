import prisma from '../../prismaClient.js';
import { logger } from '../../logger.js';
import { indexModuleForRag } from './indexing.js';
import { getModuleSourceCode } from '../../sourceCode.js';
import { generateAllModuleExplanations, generateAllPackageExplanations } from './explanations.js';
import type { Network } from '../../sui.js';
import type { GraphData } from '@suilens/core';

/**
 * Post-analysis processing:
 * 1. Upsert packages and modules to dedicated tables
 * 2. Fetch source codes
 * 3. Index for RAG
 * 
 * This runs after the main analysis completes
 */
export async function processAnalysisForRag(
  analysisId: string,
  onProgress?: (current: number, total: number, message: string) => Promise<void>
): Promise<{ 
  indexed: number; 
  failed: number; 
  moduleExplanations?: { generated: number; skipped: number; failed: number };
  packageExplanations?: { generated: number; skipped: number; failed: number };
}> {
  logger.info('post-analysis', `Starting RAG processing for analysis ${analysisId}`);

  try {
    // 1. Load analysis
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const graphData = analysis.summaryJson as unknown as GraphData;
    const network = (analysis.network as Network) || 'mainnet';

    logger.info('post-analysis', `📊 Processing ${graphData.modules.length} modules from analysis`, {
      totalModules: graphData.modules.length,
    });

    let indexed = 0;
    let failed = 0;
    let alreadyEmbedded = 0;
    let sourceCodeFound = 0;
    let sourceCodeMissing = 0;
    const total = graphData.modules.length;

    // 2. Process each module
    for (let i = 0; i < graphData.modules.length; i++) {
      const moduleNode = graphData.modules[i];
      
      // Extract module info
      const fullName = moduleNode.fullName;
      const parts = fullName.split('::');
      if (parts.length < 2) {
        logger.warn('post-analysis', `Invalid module fullName: ${fullName}`);
        continue;
      }

      const packageAddress = parts[0];
      const moduleName = parts.slice(1).join('::');

      await onProgress?.(i + 1, total, `Processing ${fullName}...`);

      try {
        // 2a. Upsert package
        const pkg = await prisma.package.upsert({
          where: { address: packageAddress },
          create: {
            address: packageAddress,
            displayName: packageAddress === '0x1' ? 'Sui Framework' :
                        packageAddress === '0x2' ? 'Sui Standard Library' :
                        null,
          },
          update: {},
        });

        // 2b. Fetch source code
        let sourceCode: string | null = null;
        
        {
          logger.debug('post-analysis', `Fetching source code for ${fullName}`);
          try {
            const moduleSource = await getModuleSourceCode(packageAddress, moduleName, network);
            sourceCode = moduleSource.sourceCode;
            sourceCodeFound++;
            logger.info('post-analysis', `✅ Source code found for ${fullName} (${sourceCode.length} chars)`);
          } catch (sourceError: any) {
            logger.warn('post-analysis', `❌ Failed to fetch source code for ${fullName}`, {
              error: sourceError.message,
            });
            sourceCodeMissing++;
            // Continue without source code
          }
        }

        // 2c. Upsert module
        const moduleFlagsJson = graphData.flags
          .filter(f => f.scope === 'module' && f.refId === moduleNode.id)
          .map(f => ({ level: f.level, kind: f.kind, details: f.details }));

        const module = await prisma.module.upsert({
          where: { fullName },
          create: {
            name: moduleName,
            fullName,
            packageId: pkg.id,
            decompiledSource: sourceCode,
            friendsJson: (moduleNode.friends || []) as any,
            flagsJson: moduleFlagsJson as any,
          },
          update: {
            decompiledSource: sourceCode || undefined,
            friendsJson: (moduleNode.friends || []) as any,
            flagsJson: moduleFlagsJson as any,
          },
        });

        // 2d. Upsert functions from moduleNode.functions array
        if (moduleNode.functions && moduleNode.functions.length > 0) {
          for (const func of moduleNode.functions) {
            const isEntry = func.isEntry || func.visibility === 'Entry';
            const visibility = func.visibility.toLowerCase();

            await prisma.function.upsert({
              where: {
                moduleId_name: {
                  moduleId: module.id,
                  name: func.name,
                },
              },
              create: {
                name: func.name,
                visibility,
                isEntry,
                moduleId: module.id,
              },
              update: {
                visibility,
                isEntry,
              },
            });
          }
        }

        // 2e. Index for RAG (skip if already indexed or no source code)
        if (sourceCode) {
          logger.debug('post-analysis', `Indexing ${fullName} for RAG`);
          const result = await indexModuleForRag(module.id, { force: false }); // Don't reindex if exists
          if (result.indexed) {
            indexed++;
            logger.info('post-analysis', `🔮 New embedding created for ${fullName}`);
          } else if (result.alreadyExists) {
            alreadyEmbedded++;
            logger.info('post-analysis', `💾 Already embedded: ${fullName}`);
          }
        } else {
          logger.warn('post-analysis', `Skipping RAG indexing for ${fullName} (no source code)`);
          failed++;
        }

      } catch (error: any) {
        logger.error('post-analysis', `Failed to process module ${fullName}`, {
          error: error.message,
          stack: error.stack,
        });
        failed++;
      }

      // Small delay to avoid overwhelming the system
      if (i % 5 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger.info('post-analysis', `✅ Source code indexing complete`, {
      newlyIndexed: indexed,
      alreadyEmbedded,
      sourceCodeFound,
      sourceCodeMissing,
      failed,
      totalProcessed: total,
    });

    // 3. Generate module explanations in parallel
    await onProgress?.(total, total, 'Generating module explanations...');
    logger.info('post-analysis', `Starting parallel module LLM analysis`);
    
    const moduleIds = graphData.modules
      .map(m => {
        // Find the module in the DB by fullName
        return m.fullName;
      })
      .filter(Boolean);
    
    const moduleExplainResults = await generateAllModuleExplanations(
      moduleIds,
      {
        force: false,
        onProgress: async (current, totalModules, message) => {
          await onProgress?.(total + current, total + totalModules, message);
        },
      }
    );
    
    logger.info('post-analysis', `✅ Module explanations complete`, moduleExplainResults);

    // 4. Generate package explanations in parallel
    await onProgress?.(total * 2, total * 2, 'Generating package explanations...');
    logger.info('post-analysis', `Starting parallel package LLM analysis`);
    
    const packageAddresses = Array.from(
      new Set(graphData.packages.map(p => p.address).filter(Boolean))
    );
    
    const packageExplainResults = await generateAllPackageExplanations(
      packageAddresses,
      {
        force: false,
        onProgress: async (current, totalPackages, message) => {
          await onProgress?.(total * 2 + current, total * 2 + totalPackages, message);
        },
      }
    );
    
    logger.info('post-analysis', `✅ Package explanations complete`, packageExplainResults);

    logger.info('post-analysis', `✅ Full RAG processing complete`, {
      sourceIndexing: { indexed, alreadyEmbedded, failed },
      moduleExplanations: moduleExplainResults,
      packageExplanations: packageExplainResults,
    });

    return { 
      indexed, 
      failed,
      moduleExplanations: moduleExplainResults,
      packageExplanations: packageExplainResults,
    };
  } catch (error: any) {
    logger.error('post-analysis', `Failed to process analysis ${analysisId}`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process analysis for RAG in background (fire and forget)
 */
export function processAnalysisForRagBackground(analysisId: string): void {
  logger.info('post-analysis', `Starting background RAG processing for analysis ${analysisId}`);

  processAnalysisForRag(analysisId, async (current, total, message) => {
    logger.debug('post-analysis', `Progress: ${current}/${total} - ${message}`);
  })
    .then((result) => {
      logger.info('post-analysis', `Background RAG processing complete for ${analysisId}`, result);
    })
    .catch((error: any) => {
      logger.error('post-analysis', `Background RAG processing failed for ${analysisId}`, {
        error: error.message,
      });
    });
}

