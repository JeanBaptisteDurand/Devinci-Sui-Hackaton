import { getModuleSourceCode } from './sourceCode.js';
import prisma from './prismaClient.js';
import { logger } from './logger.js';
import type { Network } from './sui.js';

/**
 * Enrich an analysis with source code from Revela
 * This adds precise function-to-function call information to MOD_CALLS edges
 */
export async function enrichAnalysisWithRevela(analysisId: string): Promise<void> {
  logger.info('enrich', `Starting Revela enrichment for analysis ${analysisId}`);

  try {
    // Get the analysis
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        edges: {
          where: { kind: 'MOD_CALLS' },
        },
      },
    });

    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const network = analysis.network as Network;
    const summaryJson = analysis.summaryJson as any;
    const modules = summaryJson.nodes?.filter((n: any) => n.kind === 'Module') || [];

    logger.info('enrich', `Found ${modules.length} modules to fetch source code`);

    // Fetch source code for all modules
    const sourceCodeResults = new Map<string, any>();

    for (const moduleNode of modules) {
      const fullName = moduleNode.fullName; // e.g., "0xPACKAGE::module"
      const [packageId, moduleName] = fullName.split('::');

      if (!packageId || !moduleName) {
        logger.warn('enrich', `Invalid module fullName: ${fullName}`);
        continue;
      }

      try {
        logger.debug('enrich', `Fetching source code for ${fullName}`);
        const sourceCode = await getModuleSourceCode(packageId, moduleName, network);
        sourceCodeResults.set(fullName, sourceCode);
        logger.info('enrich', `✓ Got source code for ${fullName} (${sourceCode.functions.length} functions)`);
      } catch (error: any) {
        logger.warn('enrich', `Failed to get source code for ${fullName}: ${error.message}`);
        // Continue with other modules
      }
    }

    logger.info('enrich', `Successfully fetched ${sourceCodeResults.size}/${modules.length} module source codes`);

    // Enrich MOD_CALLS edges
    let enrichedCount = 0;

    for (const edge of analysis.edges) {
      if (edge.kind !== 'MOD_CALLS') continue;

      const fromModule = edge.fromNode.replace('mod:', '');
      const toModule = edge.toNode.replace('mod:', '');

      const fromSource = sourceCodeResults.get(fromModule);
      if (!fromSource) {
        logger.debug('enrich', `No source code for source module ${fromModule}`);
        continue;
      }

      // Extract precise function calls
      const preciseCalls: Array<{
        callerFunc: string;
        calleeModule: string;
        calleeFunc: string;
      }> = [];

      // Check each function in the source module
      fromSource.functions.forEach((func: any) => {
        func.calls.forEach((call: any) => {
          // Match if the call is to the target module
          // call.module could be just "module_name" or "0xPACKAGE::module_name"
          const callModule = call.module.includes('::') ? call.module : `${fromSource.packageId.split('::')[0]}::${call.module}`;
          
          if (callModule === toModule || call.module === toModule.split('::')[1]) {
            preciseCalls.push({
              callerFunc: func.name,
              calleeModule: toModule,
              calleeFunc: call.func,
            });
          }
        });
      });

      if (preciseCalls.length > 0) {
        // Update edge evidence
        const evidenceJson = edge.evidenceJson as any || {};
        evidenceJson.calls = preciseCalls;
        evidenceJson.enriched = true;
        evidenceJson.enrichedAt = new Date().toISOString();
        evidenceJson.method = 'revela';

        await prisma.edge.update({
          where: { id: edge.id },
          data: { evidenceJson },
        });

        enrichedCount++;
        logger.debug('enrich', `Enriched edge ${fromModule} -> ${toModule} with ${preciseCalls.length} precise calls`);
      }
    }

    logger.info('enrich', `✓ Enrichment complete: ${enrichedCount} edges enriched with Revela`);
  } catch (error: any) {
    logger.error('enrich', `Failed to enrich analysis ${analysisId}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get enrichment status for an analysis
 */
export async function getEnrichmentStatus(analysisId: string): Promise<{
  total: number;
  enriched: number;
  percentage: number;
}> {
  const edges = await prisma.edge.findMany({
    where: {
      analysisId,
      kind: 'MOD_CALLS',
    },
  });

  const total = edges.length;
  const enriched = edges.filter((e) => {
    const evidence = e.evidenceJson as any;
    return evidence?.enriched === true;
  }).length;

  return {
    total,
    enriched,
    percentage: total > 0 ? Math.round((enriched / total) * 100) : 0,
  };
}

