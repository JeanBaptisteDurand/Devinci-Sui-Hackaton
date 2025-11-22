import prisma from './prismaClient.js';

export async function getAnalysis(analysisId: string, userId?: string) {
  const where: any = { id: analysisId };
  // If userId is provided, ensure the analysis belongs to that user
  if (userId) {
    where.userId = userId;
  }

  const analysis = await prisma.analysis.findFirst({
    where,
    include: {
      edges: true,
    },
  });

  if (!analysis) {
    return null;
  }

  // Return the stored summaryJson which contains the full graph data, plus metadata
  const summaryJson = analysis.summaryJson as Record<string, any>;
  return {
    ...summaryJson,
    _metadata: {
      network: analysis.network,
      packageId: analysis.packageId,
      depth: analysis.depth,
      createdAt: analysis.createdAt.toISOString(),
      slug: analysis.slug,
    },
  };
}

export async function getLastAnalysis(packageId: string) {
  const analysis = await prisma.analysis.findFirst({
    where: { packageId },
    orderBy: { createdAt: 'desc' },
    include: {
      edges: true,
    },
  });

  if (!analysis) {
    return null;
  }

  const summaryJson = analysis.summaryJson as Record<string, any>;
  return {
    ...summaryJson,
    _metadata: {
      network: analysis.network,
      packageId: analysis.packageId,
      depth: analysis.depth,
      createdAt: analysis.createdAt.toISOString(),
    },
  };
}

export async function getHistory(userId: string, packageId?: string, limit: number = 50) {
  const where: any = { userId };
  if (packageId) {
    where.packageId = packageId;
  }

  const analyses = await prisma.analysis.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      packageId: true,
      network: true,
      createdAt: true,
      slug: true,
    },
  });

  const hasMore = analyses.length > limit;
  const items = hasMore ? analyses.slice(0, limit) : analyses;

  return {
    items: items.map((a) => ({
      analysisId: a.id,
      packageId: a.packageId,
      network: a.network,
      createdAt: a.createdAt.toISOString(),
      slug: a.slug,
    })),
    hasMore,
  };
}
