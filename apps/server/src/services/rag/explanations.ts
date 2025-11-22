import prisma from '../../prismaClient.js';
import { logger } from '../../logger.js';
import { generateChatCompletion, generateEmbedding } from '../openai.js';
import { searchSimilarDocuments, upsertPackageAnalysis } from '../db.js';
import { getModuleSourceCode } from '../../sourceCode.js';
import { indexModuleAnalysis } from './indexing.js';
import type { Network } from '../../sui.js';

/**
 * Generate explanation for a single module
 */
export async function generateModuleExplanation(
  moduleId: string,
  options: { force?: boolean } = {}
): Promise<{ explanation: string; ultraSummary?: string }> {
  const { force = false } = options;

  logger.info('rag-explanations', `Generating explanation for module ${moduleId}`, { force });

  try {
    // 1. Load module (try by ID first, then by fullName)
    let module = await prisma.module.findUnique({
      where: { id: moduleId },
      include: {
        package: true,
        functions: true,
      },
    });

    // If not found by ID, try by fullName
    if (!module) {
      logger.debug('rag-explanations', `Module not found by ID, trying by fullName: ${moduleId}`);
      module = await prisma.module.findUnique({
        where: { fullName: moduleId },
        include: {
          package: true,
          functions: true,
        },
      });
    }

    if (!module) {
      throw new Error(`Module ${moduleId} not found`);
    }
    
    logger.info('rag-explanations', `Found module: ${module.fullName} (${module.id})`);
    const actualModuleId = module.id;

    // 2. Check if explanation exists and !force
    if (module.explanation && !force) {
      logger.info('rag-explanations', `Using cached explanation for ${module.fullName}`);
      return {
        explanation: module.explanation,
        ultraSummary: module.ultraSummary || undefined,
      };
    }

    // 3. Set status to pending
    await prisma.module.update({
      where: { id: actualModuleId },
      data: { explanationStatus: 'pending' },
    });

    const packageAddress = module.package.address;
    const moduleName = module.name;

    // 4. Get source code
    let sourceCode = module.decompiledSource;
    
    if (!sourceCode) {
      logger.info('rag-explanations', `Fetching source code for ${packageAddress}::${moduleName}`);
      const network: Network = 'mainnet'; // TODO: Get from analysis or package metadata
      
      const moduleSource = await getModuleSourceCode(packageAddress, moduleName, network);
      sourceCode = moduleSource.sourceCode;
      
      // Update module with decompiled source
      await prisma.module.update({
        where: { id: actualModuleId },
        data: { decompiledSource: sourceCode },
      });
    }

    // 5. Get similar modules from same package for context
    const moduleDoc = `${packageAddress}::${moduleName} source code analysis`;
    const embedding = await generateEmbedding(moduleDoc);
    
    const similarDocs = await searchSimilarDocuments({
      embedding,
      limit: 3,
      packageAddress,
    });

    // Filter out the current module from context
    const contextDocs = similarDocs.filter(doc => doc.module_id !== actualModuleId);

    // 6. Build context
    const contextParts = contextDocs.map((doc, idx) => {
      return `
--- Related Module ${idx + 1}: ${doc.module_name} ---
${doc.content.substring(0, 2000)}...
`.trim();
    });

    const context = contextParts.length > 0
      ? `\n\nRELATED MODULES IN PACKAGE:\n${contextParts.join('\n\n')}`
      : '';

    // 7. Build prompt
    const systemPrompt = `You are a Sui Move smart contract expert. Analyze the provided Move module and generate a comprehensive explanation.

Your explanation should include:

1. **Summary**: High-level overview of what this module does (2-3 sentences)

2. **Structs**: Describe key data structures, their purposes, and capabilities (key, store, copy, drop)

3. **Entry Functions**: Explain each entry function, its parameters, and what it does

4. **Security Model**: Describe access controls, capabilities, and permission checks

5. **Risks & Considerations**: Point out potential security concerns, centralization risks, or design trade-offs

At the very end, on a new line, provide:
ULTRA_SUMMARY: [One sentence describing this module's core purpose]

Be technical but clear. Focus on what the code actually does.`;

    const userPrompt = `
MODULE: ${packageAddress}::${moduleName}

SOURCE CODE:
${sourceCode}
${context}

Please provide a comprehensive explanation following the structure outlined.`;

    // 8. Call LLM
    const response = await generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.5,
        maxTokens: 2000,
      }
    );

    // 9. Parse ultra summary
    let explanation = response;
    let ultraSummary: string | undefined;

    const ultraSummaryMatch = response.match(/ULTRA_SUMMARY:\s*(.+?)(?:\n|$)/);
    if (ultraSummaryMatch) {
      ultraSummary = ultraSummaryMatch[1].trim();
      // Remove the ULTRA_SUMMARY line from the explanation
      explanation = response.replace(/\n?ULTRA_SUMMARY:.*$/m, '').trim();
    }

    // 10. Save explanation
    await prisma.module.update({
      where: { id: actualModuleId },
      data: {
        explanation,
        ultraSummary,
        explanationStatus: 'done',
      },
    });

    logger.info('rag-explanations', `✓ Generated explanation for ${module.fullName}`, {
      explanationLength: explanation.length,
      hasUltraSummary: !!ultraSummary,
    });

    // 11. Index the analysis in vector DB
    try {
      await indexModuleAnalysis(actualModuleId, { force: true });
      logger.info('rag-explanations', `✓ Indexed module analysis in vector DB for ${module.fullName}`);
    } catch (indexError: any) {
      logger.warn('rag-explanations', `Failed to index module analysis for ${module.fullName}`, {
        error: indexError.message,
      });
      // Don't fail the whole operation if indexing fails
    }

    return { explanation, ultraSummary };
  } catch (error: any) {
    logger.error('rag-explanations', `Failed to generate explanation for module ${moduleId}`, {
      error: error.message,
      stack: error.stack,
    });

    // Update status to error (try with fullName if possible)
    try {
      // Try to find module again to get actualModuleId
      const errorModule = await prisma.module.findFirst({
        where: {
          OR: [
            { id: moduleId },
            { fullName: moduleId },
          ],
        },
      });
      
      if (errorModule) {
        await prisma.module.update({
          where: { id: errorModule.id },
          data: { explanationStatus: 'error' },
        });
      }
    } catch (updateError) {
      // Ignore update errors
    }

    throw error;
  }
}

/**
 * Generate explanation for a package
 */
export async function generatePackageExplanation(
  packageId: string,
  options: { force?: boolean } = {}
): Promise<{ explanation: string }> {
  const { force = false } = options;

  logger.info('rag-explanations', `Generating explanation for package ${packageId}`, { force });

  try {
    // 1. Load package (try by ID first, then by address)
    let pkg = await prisma.package.findUnique({
      where: { id: packageId },
      include: {
        modules: {
          include: {
            functions: true,
          },
        },
      },
    });

    // If not found by ID, try by address
    if (!pkg) {
      logger.debug('rag-explanations', `Package not found by ID, trying by address: ${packageId}`);
      pkg = await prisma.package.findUnique({
        where: { address: packageId },
        include: {
          modules: {
            include: {
              functions: true,
            },
          },
        },
      });
    }

    if (!pkg) {
      throw new Error(`Package ${packageId} not found`);
    }
    
    logger.info('rag-explanations', `Found package: ${pkg.address} (${pkg.id})`);
    const actualPackageId = pkg.id;

    // 2. Check if explanation exists and !force
    if (pkg.explanation && !force) {
      logger.info('rag-explanations', `Using cached explanation for package ${pkg.address}`);
      return { explanation: pkg.explanation };
    }

    // 4. Set status to pending
    await prisma.package.update({
      where: { id: actualPackageId },
      data: { explanationStatus: 'pending' },
    });

    // 5. Generate explanations for all modules that don't have one
    logger.info('rag-explanations', `Checking ${pkg.modules.length} modules for explanations`);
    
    let modulesProcessed = 0;
    let modulesAlreadyExplained = 0;
    let modulesNewlyExplained = 0;
    
    for (const module of pkg.modules) {
      if (!module.explanation) {
        try {
          logger.info('rag-explanations', `Generating explanation for module ${module.fullName}`);
          await generateModuleExplanation(module.fullName); // Use fullName instead of ID
          modulesNewlyExplained++;
        } catch (error: any) {
          logger.warn('rag-explanations', `Failed to generate explanation for module ${module.fullName}`, {
            error: error.message,
          });
          // Continue with other modules
        }
      } else {
        logger.debug('rag-explanations', `Module ${module.fullName} already has explanation`);
        modulesAlreadyExplained++;
      }
      modulesProcessed++;
    }
    
    logger.info('rag-explanations', `Module explanations: ${modulesAlreadyExplained} existing, ${modulesNewlyExplained} generated`);

    // 6. Reload package with updated module explanations
    const updatedPkg = await prisma.package.findUnique({
      where: { id: actualPackageId },
      include: {
        modules: {
          include: {
            functions: true,
          },
        },
      },
    });

    if (!updatedPkg) {
      throw new Error(`Package ${pkg.address} (${actualPackageId}) not found after module generation`);
    }

    // 7. Build package context from module explanations
    const modulesWithSummary = updatedPkg.modules.filter(m => m.ultraSummary);
    const modulesWithExplanation = updatedPkg.modules.filter(m => m.explanation);
    
    logger.info('rag-explanations', `Building package context`, {
      totalModules: updatedPkg.modules.length,
      modulesWithSummary: modulesWithSummary.length,
      modulesWithExplanation: modulesWithExplanation.length,
    });
    
    const moduleSummaries = modulesWithSummary
      .map(m => `- ${m.name}: ${m.ultraSummary}`)
      .join('\n');

    const moduleDetails = modulesWithExplanation
      .slice(0, 5) // Limit to first 5 modules to avoid token limits
      .map(m => `
--- Module: ${m.name} ---
${m.explanation}
`.trim())
      .join('\n\n');
      
    logger.debug('rag-explanations', `Package context prepared`, {
      summariesLength: moduleSummaries.length,
      detailsLength: moduleDetails.length,
    });

    // 8. Build prompt - Regrouper les analyses des modules
    const systemPrompt = `You are a Sui Move smart contract expert. You have been provided with detailed analyses of individual modules within a package.

Your task is to synthesize these module-level analyses into a cohesive package-level explanation.

Your explanation should include:

1. **Package Overview**: What does this package do as a whole? What is its primary purpose based on all the modules?

2. **Architecture**: How are the modules organized? What are the main components and how do they interact?

3. **Key Functionality**: What are the most important features or capabilities when considering all modules together?

4. **Security & Design**: Overall security model, access controls, and architectural decisions across the package

5. **Usage & Integration**: How would other packages or users interact with this package?

6. **Module Relationships**: How do the modules work together? Are there clear separations of concerns?

Be comprehensive but concise. Focus on the big picture and how the modules form a coherent package.`;

    const userPrompt = `
PACKAGE: ${updatedPkg.address}
${updatedPkg.displayName ? `NAME: ${updatedPkg.displayName}` : ''}
Total Modules: ${updatedPkg.modules.length}

MODULE SUMMARIES (Quick Overview):
${moduleSummaries || 'No module summaries available'}

DETAILED MODULE ANALYSES (First ${modulesWithExplanation.slice(0, 5).length} modules):
${moduleDetails || 'No detailed explanations available'}

Based on these module analyses, provide a comprehensive package-level explanation that synthesizes all the information.`;

    logger.info('rag-explanations', `Calling LLM to generate package explanation for ${updatedPkg.address}`);

    // 9. Call LLM
    const explanation = await generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.5,
        maxTokens: 2500, // Augmenté pour avoir une meilleure synthèse
      }
    );

    // 10. Save explanation
    await prisma.package.update({
      where: { id: actualPackageId },
      data: {
        explanation,
        explanationStatus: 'done',
      },
    });

    logger.info('rag-explanations', `✓ Generated explanation for package ${updatedPkg.address}`, {
      explanationLength: explanation.length,
    });

    // 11. Index the package analysis in vector DB
    try {
      const embedding = await generateEmbedding(explanation);
      await upsertPackageAnalysis({
        packageId: actualPackageId,
        packageAddress: updatedPkg.address,
        content: explanation,
        embedding,
      });
      logger.info('rag-explanations', `✓ Indexed package analysis in vector DB for ${updatedPkg.address}`);
    } catch (indexError: any) {
      logger.warn('rag-explanations', `Failed to index package analysis for ${updatedPkg.address}`, {
        error: indexError.message,
      });
      // Don't fail the whole operation if indexing fails
    }

    return { explanation };
  } catch (error: any) {
    logger.error('rag-explanations', `Failed to generate explanation for package ${packageId}`, {
      error: error.message,
      stack: error.stack,
    });

    // Update status to error (try with address if possible)
    try {
      // Try to find package again to get actualPackageId
      const errorPkg = await prisma.package.findFirst({
        where: {
          OR: [
            { id: packageId },
            { address: packageId },
          ],
        },
      });
      
      if (errorPkg) {
        await prisma.package.update({
          where: { id: errorPkg.id },
          data: { explanationStatus: 'error' },
        });
      }
    } catch (updateError) {
      // Ignore update errors
    }

    throw error;
  }
}

/**
 * Generate explanations for multiple modules in parallel
 * Skips modules that already have explanations unless force=true
 */
export async function generateAllModuleExplanations(
  moduleIds: string[],
  options: {
    force?: boolean;
    onProgress?: (current: number, total: number, message: string) => Promise<void>;
  } = {}
): Promise<{
  generated: number;
  skipped: number;
  failed: number;
  total: number;
}> {
  const { force = false, onProgress } = options;

  logger.info('rag-explanations', `Starting parallel module explanations`, {
    totalModules: moduleIds.length,
    force,
  });

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const total = moduleIds.length;

  // Generate all explanations in parallel
  const results = await Promise.allSettled(
    moduleIds.map(async (moduleId, index) => {
      try {
        await onProgress?.(index + 1, total, `Analyzing module ${index + 1}/${total}...`);

        const result = await generateModuleExplanation(moduleId, { force });

        if (result) {
          generated++;
          logger.info('rag-explanations', `✓ Module ${moduleId} explained`);
        }

        return { success: true, moduleId };
      } catch (error: any) {
        failed++;
        logger.error('rag-explanations', `✗ Failed to explain module ${moduleId}`, {
          error: error.message,
        });
        return { success: false, moduleId, error: error.message };
      }
    })
  );

  // Count skipped (modules that already had explanations)
  skipped = total - generated - failed;

  logger.info('rag-explanations', `Parallel module explanations complete`, {
    generated,
    skipped,
    failed,
    total,
  });

  return { generated, skipped, failed, total };
}

/**
 * Generate explanations for multiple packages in parallel
 * This will also trigger module explanations if needed
 * Skips packages that already have explanations unless force=true
 */
export async function generateAllPackageExplanations(
  packageIds: string[],
  options: {
    force?: boolean;
    onProgress?: (current: number, total: number, message: string) => Promise<void>;
  } = {}
): Promise<{
  generated: number;
  skipped: number;
  failed: number;
  total: number;
}> {
  const { force = false, onProgress } = options;

  logger.info('rag-explanations', `Starting parallel package explanations`, {
    totalPackages: packageIds.length,
    force,
  });

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const total = packageIds.length;

  // Generate all package explanations in parallel
  const results = await Promise.allSettled(
    packageIds.map(async (packageId, index) => {
      try {
        await onProgress?.(index + 1, total, `Analyzing package ${index + 1}/${total}...`);

        // Check if package already has explanation
        const pkg = await prisma.package.findFirst({
          where: {
            OR: [{ id: packageId }, { address: packageId }],
          },
          select: { explanation: true, address: true },
        });

        if (pkg?.explanation && !force) {
          skipped++;
          logger.info('rag-explanations', `Skipping package ${packageId} (already has explanation)`);
          return { success: true, packageId, skipped: true };
        }

        const result = await generatePackageExplanation(packageId, { force });

        if (result) {
          generated++;
          logger.info('rag-explanations', `✓ Package ${packageId} explained`);
        }

        return { success: true, packageId, skipped: false };
      } catch (error: any) {
        failed++;
        logger.error('rag-explanations', `✗ Failed to explain package ${packageId}`, {
          error: error.message,
        });
        return { success: false, packageId, error: error.message };
      }
    })
  );

  logger.info('rag-explanations', `Parallel package explanations complete`, {
    generated,
    skipped,
    failed,
    total,
  });

  return { generated, skipped, failed, total };
}

/**
 * Generate global analysis summary
 * This generates a business-focused overview of the entire analysis, focusing on the primary package
 * and how it interacts with dependencies to form coherent business logic.
 */
export async function generateGlobalAnalysisSummary(
  analysisId: string,
  options: { force?: boolean } = {}
): Promise<{ summary: string }> {
  const { force = false } = options;

  logger.info('rag-explanations', `Generating global analysis summary for ${analysisId}`, { force });

  try {
    // 1. Load analysis
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    // 2. Get graph data to identify packages
    const graphData = analysis.summaryJson as any;
    const packages = graphData.packages || [];
    
    if (packages.length === 0) {
      throw new Error('No packages found in analysis');
    }

    // 3. Identify primary package (first one, or the one matching analysis.packageId)
    const primaryPackage = packages.find((p: any) => p.address === analysis.packageId) || packages[0];
    const primaryPackageAddress = primaryPackage.address;

    // 4. Check if summary exists for this primary package and !force
    const existingSummary = await prisma.globalAnalysisSummary.findUnique({
      where: { analysisId },
    });

    if (existingSummary?.summary && existingSummary.primaryPackageId === primaryPackageAddress && !force) {
      logger.info('rag-explanations', `Using cached global summary for analysis ${analysisId} (primaryPackage: ${primaryPackageAddress})`);
      return { summary: existingSummary.summary };
    }
    
    logger.info('rag-explanations', `Primary package: ${primaryPackageAddress}`, {
      totalPackages: packages.length,
    });

    // 5. Get all package explanations
    const packageAddresses = packages.map((p: any) => p.address);
    const packagesWithExplanations = await prisma.package.findMany({
      where: {
        address: { in: packageAddresses },
        explanation: { not: null },
      },
      select: {
        address: true,
        displayName: true,
        explanation: true,
      },
    });

    logger.info('rag-explanations', `Found ${packagesWithExplanations.length} packages with explanations`, {
      totalPackages: packageAddresses.length,
    });

    if (packagesWithExplanations.length === 0) {
      throw new Error('No package explanations found. Please generate package explanations first.');
    }

    // 6. Find primary package explanation
    const primaryPackageExplanation = packagesWithExplanations.find(
      (p) => p.address === primaryPackageAddress
    );

    if (!primaryPackageExplanation) {
      throw new Error(`Primary package ${primaryPackageAddress} does not have an explanation. Please generate it first.`);
    }

    // 7. Build context with all package explanations
    const packageExplanationsText = packagesWithExplanations
      .map((pkg) => {
        const isPrimary = pkg.address === primaryPackageAddress;
        return `
--- ${isPrimary ? 'PRIMARY PACKAGE' : 'DEPENDENCY PACKAGE'}: ${pkg.displayName || pkg.address} ---
${pkg.explanation}
`.trim();
      })
      .join('\n\n');

    // 8. Build prompt (shorter, more focused)
    const systemPrompt = `You are a Sui Move smart contract expert and business analyst. Generate a very concise business-focused summary (2-3 short paragraphs maximum).

Focus on:
1. What the primary package does from a business perspective
2. How it integrates with dependencies to form a complete solution

Keep it brief and accessible. End with: "To learn more about each specific package or module, explore the AI menu."`;

    const userPrompt = `
ANALYSIS ID: ${analysisId}
PRIMARY PACKAGE: ${primaryPackageAddress}${primaryPackageExplanation.displayName ? ` (${primaryPackageExplanation.displayName})` : ''}
TOTAL PACKAGES: ${packages.length}
NETWORK: ${analysis.network || 'mainnet'}

PACKAGE EXPLANATIONS:
${packageExplanationsText}

Based on these package analyses, provide a concise global summary that explains the business logic and architecture from a high-level perspective, focusing on the primary package and how it integrates with dependencies.`;

    logger.info('rag-explanations', `Calling LLM to generate global summary for analysis ${analysisId}`);

    // 9. Call LLM (smaller response)
    const summary = await generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.5,
        maxTokens: 600, // Much smaller response
      }
    );

    // 10. Save summary with primaryPackageId (plain text only, ciphertext will be added later)
    await prisma.globalAnalysisSummary.upsert({
      where: { analysisId },
      create: {
        analysisId,
        primaryPackageId: primaryPackageAddress,
        summary,
        ciphertext: null, // Will be encrypted later
      },
      update: {
        primaryPackageId: primaryPackageAddress,
        summary,
        // Don't update ciphertext yet
      },
    });

    logger.info('rag-explanations', `✓ Generated global summary for analysis ${analysisId}`, {
      summaryLength: summary.length,
    });

    return { summary };
  } catch (error: any) {
    logger.error('rag-explanations', `Failed to generate global summary for analysis ${analysisId}`, {
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
}

