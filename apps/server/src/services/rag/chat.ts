import prisma from '../../prismaClient.js';
import { logger } from '../../logger.js';
import { generateEmbedding, generateChatCompletion } from '../openai.js';
import { searchSimilarDocuments } from '../db.js';

export interface RagChatParams {
  question: string;
  chatId?: number;
  analysisId?: string;
  packageId?: string;
  moduleId?: string;
}

export interface RagChatResult {
  answer: string;
  chatId: number;
  sourcesUsed: Array<{
    moduleId: string;
    packageAddress: string;
    moduleName: string;
    similarity: number;
  }>;
}

/**
 * RAG Chat: Answer questions using vector search + LLM
 */
export async function ragChat(params: RagChatParams): Promise<RagChatResult> {
  const { question, chatId: existingChatId, analysisId, packageId, moduleId } = params;

  logger.info('rag-chat', 'Processing RAG chat request', {
    hasExistingChat: !!existingChatId,
    analysisId,
    packageId,
    moduleId,
  });

  try {
    // 1. Get or create chat session
    let chatId = existingChatId;

    if (!chatId) {
      const chat = await prisma.ragChat.create({
        data: {
          analysisId: analysisId || null,
          packageId: packageId || null,
          moduleId: moduleId || null,
        },
      });
      chatId = Number(chat.id);
      logger.info('rag-chat', `Created new chat session: ${chatId}`, {
        analysisId,
        packageId,
        moduleId,
      });
    }

    // 2. Save user message
    await prisma.ragMessage.create({
      data: {
        chatId: BigInt(chatId),
        role: 'user',
        content: question,
      },
    });

    // 3. Build enhanced question with package/module context for better vector search
    let enhancedQuestion = question;
    let dynamicLimit = 20; // Default limit

    // Get packages and modules from analysis if analysisId is provided
    if (analysisId) {
      const analysis = await prisma.analysis.findUnique({
        where: { id: analysisId },
        select: { summaryJson: true, packageId: true },
      });

      if (analysis) {
        const graphData = analysis.summaryJson as any;
        const packages = graphData.packages || [];
        const modules = graphData.modules || [];

        // Calculate dynamic limit: (modules + packages) * 2
        // *2 because each has source code + AI explanation in vector DB
        dynamicLimit = (modules.length + packages.length) * 2;

        logger.info('rag-chat', `Calculated dynamic limit for vector search`, {
          modulesCount: modules.length,
          packagesCount: packages.length,
          totalDocs: modules.length + packages.length,
          dynamicLimit,
        });

        // Prepend package and module context - INCLUDE ALL, not just first 10
        const packageIds = packages.map((p: any) => p.address || p.displayName).filter(Boolean).join(', ');
        const moduleIds = modules.map((m: any) => m.fullName || m.name).filter(Boolean).join(', '); // Removed .slice(0, 10)

        enhancedQuestion = `Context: Analyzing packages [${packageIds}] with modules [${moduleIds}]. Question: ${question}`;

        logger.info('rag-chat', `Enhanced question with analysis context`, {
          analysisId,
          packagesCount: packages.length,
          modulesCount: modules.length,
        });
      }
    } else if (packageId) {
      // If no analysisId but we have packageId, try to get modules for that package
      const pkg = await prisma.package.findFirst({
        where: {
          OR: [{ id: packageId }, { address: packageId }],
        },
        include: {
          modules: {
            select: { fullName: true },
          },
        },
      });

      if (pkg) {
        const moduleIds = pkg.modules.map(m => m.fullName).join(', ');
        enhancedQuestion = `Context: Package ${pkg.address} with modules [${moduleIds}]. Question: ${question}`;

        logger.info('rag-chat', `Enhanced question with package context`, {
          packageAddress: pkg.address,
          modulesCount: pkg.modules.length,
        });
      }
    }

    // 4. Generate embedding for the enhanced question
    const questionEmbedding = await generateEmbedding(enhancedQuestion);

    // 5. Vector search for relevant documents
    // packageId from frontend can be either DB ID or package address
    let packageAddress: string | undefined = undefined;

    if (packageId) {
      // Try to find package by ID first, then by address
      let pkg = await prisma.package.findUnique({ where: { id: packageId } });
      if (!pkg) {
        pkg = await prisma.package.findUnique({ where: { address: packageId } });
      }

      if (pkg) {
        packageAddress = pkg.address;
        logger.info('rag-chat', `Resolved package: ${packageAddress} (from ${packageId})`);
      } else {
        logger.warn('rag-chat', `Package not found: ${packageId}, will search across all packages`);
      }
    }

    const similarDocs = await searchSimilarDocuments({
      embedding: questionEmbedding,
      limit: dynamicLimit, // Dynamic: (modules + packages) * 2 to get all source + AI explanations
      packageAddress,
    });

    logger.info('rag-chat', `Found ${similarDocs.length} similar documents`, {
      packageAddress,
      similarities: similarDocs.map(d => ({ module: d.module_name, similarity: d.similarity })),
    });

    // 5b. ENRICHMENT: Get existing explanations for similar modules
    const moduleIdsFromSearch = similarDocs.map(d => d.module_id);

    const modulesWithExplanations = await prisma.module.findMany({
      where: {
        id: { in: moduleIdsFromSearch },
        explanation: { not: null },
      },
      select: {
        id: true,
        fullName: true,
        explanation: true,
        ultraSummary: true,
      },
    });

    logger.info('rag-chat', `Found ${modulesWithExplanations.length} modules with existing explanations`);

    // 5c. Get package explanation if scoped
    let packageExplanation: string | null = null;
    if (packageId) {
      const pkg = await prisma.package.findUnique({
        where: { id: packageId },
        select: { explanation: true, address: true },
      });
      packageExplanation = pkg?.explanation || null;

      if (packageExplanation) {
        logger.info('rag-chat', `Using package explanation for context`);
      }
    }

    // 6. Get conversation history (last N messages)
    const historyLimit = 10;
    const history = await prisma.ragMessage.findMany({
      where: { chatId: BigInt(chatId) },
      orderBy: { createdAt: 'desc' },
      take: historyLimit,
    });

    // Reverse to get chronological order
    const chronologicalHistory = history.reverse();

    // 7. Build context from similar documents + existing explanations
    const contextParts: string[] = [];

    // FIRST: Add complete list of ALL packages and modules in this analysis for exact matching
    if (analysisId) {
      const analysis = await prisma.analysis.findUnique({
        where: { id: analysisId },
        select: { summaryJson: true },
      });

      if (analysis) {
        const graphData = analysis.summaryJson as any;
        const packages = graphData.packages || [];
        const modules = graphData.modules || [];

        // Build a comprehensive directory of packages and modules
        const packageList = packages.map((p: any) => {
          const addr = p.address || p.displayName || 'unknown';
          return `  - ${addr}${p.displayName ? ` (${p.displayName})` : ''}`;
        }).join('\n');

        const moduleList = modules.map((m: any) => {
          const fullName = m.fullName || m.name || 'unknown';
          return `  - ${fullName}`;
        }).join('\n');

        contextParts.push(`
--- COMPLETE ANALYSIS INVENTORY ---
This analysis contains the following packages and modules. Use this directory for exact name/address matching:

PACKAGES (${packages.length} total):
${packageList}

MODULES (${modules.length} total):
${moduleList}

Note: Package addresses may appear with or without leading zeros (e.g., 0x2 = 0x02 = 0x002...).
`.trim());
      }
    }

    // Add package explanation if available
    if (packageExplanation) {
      contextParts.push(`
--- PACKAGE OVERVIEW ---
${packageExplanation}
`.trim());
    }

    // Add module explanations if available
    if (modulesWithExplanations.length > 0) {
      modulesWithExplanations.forEach((mod, idx) => {
        contextParts.push(`
--- Module Explanation: ${mod.fullName} ---
${mod.explanation}
`.trim());
      });
    }

    // Add raw source code documents from vector search
    similarDocs.forEach((doc, idx) => {
      // Only add if we don't already have an explanation for this module
      const hasExplanation = modulesWithExplanations.some(m => m.id === doc.module_id);

      if (!hasExplanation) {
        contextParts.push(`
--- Raw Source Document ${idx + 1} (Similarity: ${(doc.similarity * 100).toFixed(1)}%) ---
${doc.content}
`.trim());
      }
    });

    const context = contextParts.join('\n\n');

    // 8. Build messages for LLM
    const systemPrompt = `You are a Sui Move smart contract expert assistant. Your role is to answer questions about Sui Move packages and modules using ONLY the provided context.

IMPORTANT RULES:
- Answer questions based ONLY on the provided context documents
- When asked about "all packages with module X", check the COMPLETE ANALYSIS INVENTORY first
- Package addresses can have different formats (0x1 = 0x01 = 0x001...) - treat them as equivalent
- Module full names are in format: package_address::module_name
- If the context doesn't contain enough information, say so honestly
- Cite specific module names and package addresses when referencing information
- Be precise and technical when discussing Move code
- If asked about security, focus on what you can see in the code
- Do not make assumptions beyond what's in the context

CONTEXT DOCUMENTS:
${context}`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (excluding the current question we just added)
    for (const msg of chronologicalHistory.slice(0, -1)) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Add current question
    messages.push({ role: 'user', content: question });

    // 9. Generate answer
    const answer = await generateChatCompletion(messages, {
      temperature: 0.7,
      maxTokens: 1500,
    });

    // 10. Save assistant response
    await prisma.ragMessage.create({
      data: {
        chatId: BigInt(chatId),
        role: 'assistant',
        content: answer,
      },
    });

    logger.info('rag-chat', `Generated answer for chat ${chatId}`, {
      answerLength: answer.length,
    });

    return {
      answer,
      chatId,
      sourcesUsed: similarDocs.map(doc => ({
        moduleId: doc.module_id,
        packageAddress: doc.package_address,
        moduleName: doc.module_name,
        similarity: doc.similarity,
      })),
    };
  } catch (error: any) {
    logger.error('rag-chat', 'Failed to process RAG chat', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Get chat history
 */
export async function getChatHistory(chatId: number): Promise<Array<{
  id: number;
  role: string;
  content: string;
  createdAt: Date;
}>> {
  try {
    const messages = await prisma.ragMessage.findMany({
      where: { chatId: BigInt(chatId) },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map(msg => ({
      id: Number(msg.id),
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    }));
  } catch (error: any) {
    logger.error('rag-chat', `Failed to get chat history for ${chatId}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Delete a chat session
 */
export async function deleteChat(chatId: number): Promise<void> {
  try {
    await prisma.ragChat.delete({
      where: { id: BigInt(chatId) },
    });

    logger.info('rag-chat', `Deleted chat ${chatId}`);
  } catch (error: any) {
    logger.error('rag-chat', `Failed to delete chat ${chatId}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * List all chat sessions (with optional filters including analysisId)
 */
export async function listChats(options: {
  analysisId?: string;
  packageId?: string;
  moduleId?: string;
  limit?: number;
} = {}): Promise<Array<{
  id: number;
  analysisId: string | null;
  packageId: string | null;
  moduleId: string | null;
  createdAt: Date;
  messageCount: number;
}>> {
  const { analysisId, packageId, moduleId, limit = 50 } = options;

  try {
    const where: any = {};
    if (analysisId) where.analysisId = analysisId;
    if (packageId) where.packageId = packageId;
    if (moduleId) where.moduleId = moduleId;

    const chats = await prisma.ragChat.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    return chats.map(chat => ({
      id: Number(chat.id),
      analysisId: chat.analysisId,
      packageId: chat.packageId,
      moduleId: chat.moduleId,
      createdAt: chat.createdAt,
      messageCount: chat._count.messages,
    }));
  } catch (error: any) {
    logger.error('rag-chat', 'Failed to list chats', {
      error: error.message,
    });
    throw error;
  }
}

