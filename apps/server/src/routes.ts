import { Router } from 'express';
import { getAnalysis, getLastAnalysis, getHistory } from './history.js';
import { enqueueAnalysis, getJobStatus } from './queue.js';
import { logger } from './logger.js';
import prisma from './prismaClient.js';
import { getModuleSourceCode } from './sourceCode.js';
import { enrichAnalysisWithRevela, getEnrichmentStatus } from './enrichSource.js';
import { getSuiClient } from './sui.js';
import type { GraphData } from '@suilens/core';
import type { Network } from './sui.js';
import { requireAuth, optionalAuth, type AuthRequest } from './auth.js';

const router = Router();

// V2: Async analysis with job queue
router.post('/analyze', requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      packageId,
      maxPkgDepth,
      maxObjDepth,
      typeCountThreshold,
      sampleLargeTypes,
      eventsWindowDays,
      criticalTypes,
    } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info('routes', `POST /api/analyze - Request received`, {
      packageId,
      maxPkgDepth,
      maxObjDepth,
      userId: req.user.id,
    });

    if (!packageId) {
      logger.warn('routes', 'Missing packageId in request');
      return res.status(400).json({ error: 'packageId is required' });
    }

    // Enqueue analysis job with userId
    const jobId = await enqueueAnalysis({
      packageId,
      maxPkgDepth,
      maxObjDepth,
      typeCountThreshold,
      sampleLargeTypes,
      eventsWindowDays,
      criticalTypes,
      userId: req.user.id,
    });

    logger.info('routes', `POST /api/analyze - Job queued`, { jobId, userId: req.user.id });
    res.status(202).json({ jobId, status: 'queued' });
  } catch (error: any) {
    logger.error('routes', 'POST /api/analyze - Failed', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message || 'Failed to queue analysis' });
  }
});

// Get job status
router.get('/analyze/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    logger.info('routes', `GET /api/analyze/${jobId}/status - Request received`);

    const status = await getJobStatus(jobId);
    if (!status) {
      logger.warn('routes', `Job not found: ${jobId}`);
      return res.status(404).json({ error: 'Job not found' });
    }

    logger.info('routes', `GET /api/analyze/${jobId}/status - Success`, { status: status.status });
    res.json(status);
  } catch (error: any) {
    logger.error('routes', 'GET /api/analyze/:jobId/status - Failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to get job status' });
  }
});

router.get('/analysis/:analysisId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { analysisId } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info('routes', `GET /api/analysis/${analysisId} - Request received`, {
      userId: req.user.id,
    });

    const analysis = await getAnalysis(analysisId, req.user.id);
    if (!analysis) {
      logger.warn('routes', `Analysis not found or access denied: ${analysisId}`, {
        userId: req.user.id,
      });
      return res.status(404).json({ error: 'Analysis not found or access denied' });
    }

    logger.info('routes', `GET /api/analysis/${analysisId} - Success`, {
      hasPackages: !!(analysis as any).packages,
      hasModules: !!(analysis as any).modules,
      hasEdges: !!(analysis as any).edges,
      packagesCount: (analysis as any).packages?.length || 0,
      modulesCount: (analysis as any).modules?.length || 0,
      edgesCount: (analysis as any).edges?.length || 0,
    });

    res.json(analysis);
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id - Failed', { error: error.message });
    console.error('Get analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to get analysis' });
  }
});

router.get('/last', async (req, res) => {
  try {
    const { packageId } = req.query;
    if (!packageId || typeof packageId !== 'string') {
      return res.status(400).json({ error: 'packageId query parameter is required' });
    }
    const analysis = await getLastAnalysis(packageId);
    if (!analysis) {
      return res.status(404).json({ error: 'No analysis found for this package' });
    }
    res.json(analysis);
  } catch (error: any) {
    console.error('Get last analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to get last analysis' });
  }
});

router.get('/history', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { packageId, limit } = req.query;
    const result = await getHistory(
      req.user.id,
      packageId as string | undefined,
      limit ? parseInt(limit as string, 10) : undefined
    );
    res.json(result);
  } catch (error: any) {
    console.error('Get history error:', error);
    res.status(500).json({ error: error.message || 'Failed to get history' });
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get analysis graph data
router.get('/analysis/:analysisId/graph', async (req, res) => {
  try {
    const { analysisId } = req.params;
    const analysis = await getAnalysis(analysisId);

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json(analysis);
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id/graph - Failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to get graph' });
  }
});

// Get edge details
router.get('/analysis/:analysisId/edge', async (req, res) => {
  try {
    const { analysisId } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query parameters are required' });
    }

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const graphData = analysis.summaryJson as unknown as GraphData;
    const edge = graphData.edges.find((e) => e.from === from && e.to === to);

    if (!edge) {
      return res.status(404).json({ error: 'Edge not found' });
    }

    res.json({ edge });
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id/edge - Failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to get edge' });
  }
});

// Get module details
router.get('/analysis/:analysisId/module/:moduleFqn(*)', async (req, res) => {
  try {
    const { analysisId, moduleFqn } = req.params;

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const graphData = analysis.summaryJson as unknown as GraphData;
    const module = graphData.modules.find((m) => m.fullName === moduleFqn || m.id === `mod:${moduleFqn}`);

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Find related types, calls, friends
    const types = graphData.types.filter((t) => t.module === module.id);
    const outgoingCalls = graphData.edges.filter((e) => e.kind === 'MOD_CALLS' && e.from === module.id);
    const incomingCalls = graphData.edges.filter((e) => e.kind === 'MOD_CALLS' && e.to === module.id);
    const friendEdges = graphData.edges.filter((e) => e.kind === 'MOD_FRIEND_ALLOW' && e.from === module.id);
    const flags = graphData.flags.filter((f) => f.refId === module.id);

    res.json({
      module,
      types,
      outgoingCalls: outgoingCalls.map((e) => e.to),
      incomingCalls: incomingCalls.map((e) => e.from),
      friends: friendEdges.map((e) => e.to),
      flags,
    });
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id/module/:fqn - Failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to get module' });
  }
});

// Lazy-load objects for a specific type (on-demand)
// IMPORTANT: This route MUST come BEFORE the general type route to avoid route conflict
router.get('/analysis/:analysisId/type/:typeFqn(*)/objects', async (req, res) => {
  try {
    const { analysisId, typeFqn } = req.params;
    const { limit = '50' } = req.query;

    logger.info('routes', `GET /api/analysis/${analysisId}/type/${typeFqn}/objects - Lazy loading objects`);

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const primaryNetwork = (analysis.network || 'mainnet') as Network;
    
    logger.info('routes', `Fetching objects, primary network: ${primaryNetwork.toUpperCase()}`);
    
    const graphData = analysis.summaryJson as unknown as GraphData;
    
    // Debug logging
    logger.debug('routes', `Looking for type: "${typeFqn}"`);
    logger.debug('routes', `Total types in graph: ${graphData.types?.length || 0}`);
    
    // Try different ways to find the type
    let type = graphData.types?.find((t) => t.fqn === typeFqn);
    if (!type) {
      type = graphData.types?.find((t) => t.id === `type:${typeFqn}`);
    }
    if (!type) {
      // Try case-insensitive match
      type = graphData.types?.find((t) => t.fqn.toLowerCase() === typeFqn.toLowerCase());
    }
    
    if (!type) {
      logger.error('routes', `Type not found: "${typeFqn}"`);
      logger.debug('routes', `Available types (first 5):`, graphData.types?.slice(0, 5).map(t => t.fqn));
      return res.status(404).json({ 
        error: 'Type not found',
        requested: typeFqn,
        availableTypes: graphData.types?.slice(0, 10).map(t => t.fqn),
      });
    }
    
    logger.info('routes', `Found type: ${type.fqn}, hasKey: ${type.hasKey}`);

    if (!type.hasKey) {
      return res.json({
        objects: [],
        message: 'Type does not have key ability (not an on-chain object type)',
        network: primaryNetwork,
      });
    }

    // Fetch objects using GraphQL
    const { queryObjectsByType } = await import('./graphql.js');
    
    // Objects MUST be on the same network as the package analysis
    // No cross-network fallback - if package is on testnet, objects are on testnet
    const network = primaryNetwork;
    
    logger.info('routes', `Fetching objects on ${network.toUpperCase()} (same network as package)`);
    
    // Note: GraphQL is currently only available on mainnet
    if (network !== 'mainnet') {
      logger.warn('routes', `GraphQL not available for ${network}, object fetching is limited to mainnet`);
      return res.json({
        objects: [],
        hasMore: false,
        nextCursor: null,
        network: network,
        message: `Object fetching via GraphQL is currently only available on mainnet. This package is on ${network}.`,
      });
    }
    
    const result = await queryObjectsByType({
      network,
      structType: type.fqn,
      limit: parseInt(limit as string, 10),
    });

    logger.info('routes', `✓ Fetched ${result.objects.length} objects for type ${type.fqn} on ${network.toUpperCase()}`);

    // Transform to ObjectNode format
    const objects = result.objects.map((gqlObj) => {
      let ownerData: any = { kind: 'Shared' };
      
      if (gqlObj.owner.__typename === 'AddressOwner' && gqlObj.owner.owner?.address) {
        ownerData = { kind: 'AddressOwner', address: gqlObj.owner.owner.address };
      } else if (gqlObj.owner.__typename === 'Shared') {
        ownerData = { kind: 'Shared' };
      } else if (gqlObj.owner.__typename === 'Immutable') {
        ownerData = { kind: 'Immutable' };
      }

      return {
        id: `obj:${gqlObj.address}`,
        objectId: gqlObj.address,
        typeFqn: type.fqn,
        owner: ownerData,
        shared: gqlObj.owner.__typename === 'Shared',
        version: gqlObj.version?.toString(),
        digest: gqlObj.digest,
        snapshot: gqlObj.asMoveObject?.contents?.json || {},
      };
    });

    res.json({
      objects,
      hasMore: result.hasNextPage,
      nextCursor: result.nextCursor,
      network: network, // Return the network used
    });
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id/type/:fqn/objects - Failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to fetch objects' });
  }
});

// Get type details
router.get('/analysis/:analysisId/type/:typeFqn(*)', async (req, res) => {
  try {
    const { analysisId, typeFqn } = req.params;

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const graphData = analysis.summaryJson as unknown as GraphData;
    const type = graphData.types.find((t) => t.fqn === typeFqn || t.id === `type:${typeFqn}`);

    if (!type) {
      return res.status(404).json({ error: 'Type not found' });
    }

    // Find the defining module
    const definingModule = graphData.modules.find((m) => 
      type.fqn.startsWith(m.fullName + '::')
    );

    // Find types that THIS type uses (TYPE_USES_TYPE edges originating from this type)
    const usesTypeEdges = graphData.edges.filter(
      (e) => e.kind === 'TYPE_USES_TYPE' && e.from === type.id
    );
    const usesTypes = usesTypeEdges
      .map((e) => graphData.types.find((t) => t.id === e.to))
      .filter(Boolean)
      .map((t) => t!.fqn);

    // Find objects of this type (for backward compatibility, but note: now lazy-loaded)
    const objects = graphData.objects.filter((o) => o.typeFqn === typeFqn);
    const stats = graphData.stats.types[typeFqn];

    res.json({
      type,
      stats,
      samples: objects.slice(0, 10).map((o) => o.objectId),
      objectCount: objects.length,
      definedBy: definingModule?.fullName || null,
      usesTypes,
    });
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id/type/:fqn - Failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to get type' });
  }
});

// Get object details
router.get('/analysis/:analysisId/object/:objectId', async (req, res) => {
  try {
    const { analysisId, objectId } = req.params;

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const graphData = analysis.summaryJson as unknown as GraphData;
    const object = graphData.objects.find((o) => o.objectId === objectId || o.id === `obj:${objectId}`);

    if (!object) {
      return res.status(404).json({ error: 'Object not found' });
    }

    // Find related edges (parent, children, refs)
    const parentEdges = graphData.edges.filter((e) => e.kind === 'OBJ_DF_CHILD' && e.to === object.id);
    const childrenEdges = graphData.edges.filter((e) => e.kind === 'OBJ_DF_CHILD' && e.from === object.id);
    const refEdges = graphData.edges.filter((e) => e.kind === 'OBJ_REFERS_OBJ' && (e.from === object.id || e.to === object.id));
    const flags = graphData.flags.filter((f) => f.refId === object.id);

    res.json({
      object,
      parents: parentEdges.map((e) => e.from),
      children: childrenEdges.map((e) => e.to),
      refs: refEdges.map((e) => (e.from === object.id ? e.to : e.from)),
      flags,
    });
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id/object/:objectId - Failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to get object' });
  }
});

// Get events (paginated, RPC-based for module/package scope)
router.get('/analysis/:analysisId/events', async (req, res) => {
  try {
    const { analysisId } = req.params;
    const { scope, id, limit = '30', cursor } = req.query;

    logger.info('routes', `GET /api/analysis/${analysisId}/events`, { scope, id, cursor: cursor ? 'present' : 'none' });

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const network = (analysis.network || 'mainnet') as Network;
    const suiClient = getSuiClient(network);

    logger.info('routes', `Querying events on network: ${network.toUpperCase()}`);

    // Parse cursor if present
    let parsedCursor = null;
    if (cursor && cursor !== 'null') {
      try {
        parsedCursor = JSON.parse(cursor as string);
        logger.debug('routes', 'Parsed cursor:', parsedCursor);
      } catch (e) {
        logger.warn('routes', 'Failed to parse cursor, ignoring:', cursor);
      }
    }

    // Build query filter based on scope
    let filter: any;
    if (scope === 'mod' && id) {
      // Module-scoped events: MoveModule filter
      // Parse module FQN format: "0xPackageID::moduleName"
      const moduleFqn = id as string;
      const parts = moduleFqn.split('::');
      if (parts.length !== 2) {
        return res.status(400).json({ error: 'Invalid module format. Expected: 0xPackageID::moduleName' });
      }
      const [packageId, moduleName] = parts;
      filter = { 
        MoveModule: {
          package: packageId,
          module: moduleName
        }
      };
      logger.info('routes', 'Querying events for module:', { packageId, moduleName });
    } else if (scope === 'pkg' && id) {
      // Package-scoped events: Package filter
      filter = { Package: id as string };
      logger.info('routes', 'Querying events for package:', id);
    } else {
      return res.status(400).json({ error: 'Missing or invalid scope/id parameters' });
    }

    // Query events from RPC
    // The Sui SDK expects the filter to be wrapped in a 'query' property
    const queryOptions: any = {
      query: filter,
      limit: parseInt(limit as string, 10),
    };

    if (parsedCursor) {
      queryOptions.cursor = parsedCursor;
    }

    logger.debug('routes', 'Querying events with options:', JSON.stringify(queryOptions));
    logger.debug('routes', 'Full queryOptions object:', queryOptions);
    logger.debug('routes', 'Filter details:', { 
      filterType: typeof filter, 
      filterKeys: Object.keys(filter),
      filterMoveModule: filter.MoveModule,
      filterPackage: filter.Package
    });

    let result;
    try {
      result = await suiClient.queryEvents(queryOptions);
      logger.debug('routes', 'Raw result from queryEvents:', JSON.stringify({ 
        hasData: !!result?.data, 
        dataLength: result?.data?.length,
        hasNextPage: result?.hasNextPage 
      }));
      logger.debug('routes', 'Full result object:', result);
    } catch (queryError: any) {
      logger.error('routes', 'Error calling suiClient.queryEvents:', queryError.message);
      logger.error('routes', 'Full error:', queryError);
      logger.error('routes', 'Error stack:', queryError.stack);
      // Return empty result instead of failing
      return res.json({
        items: [],
        nextCursor: null,
        hasNextPage: false,
      });
    }

    if (!result || !result.data) {
      logger.warn('routes', 'No events returned from RPC');
      return res.json({
        items: [],
        nextCursor: null,
        hasNextPage: false,
      });
    }

    logger.info('routes', `Fetched ${result.data.length} events from ${network.toUpperCase()}, hasNextPage: ${result.hasNextPage}`);

    // Transform to expected format (matching EventNode interface)
    const items = result.data.map((event: any) => ({
      id: `${event.id.txDigest}:${event.id.eventSeq}`,
      eventId: `${event.id.txDigest}:${event.id.eventSeq}`,
      kind: event.type, // Full event type
      pkgAddr: event.packageId,
      modName: event.transactionModule,
      ts: parseInt(event.timestampMs || '0', 10),
      tx: event.id.txDigest,
      data: event.parsedJson || {},
      sender: event.sender,
    }));

    res.json({
      items,
      nextCursor: result.nextCursor || null,
      hasNextPage: result.hasNextPage || false,
    });
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id/events - Failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to get events' });
  }
});

// Get function source code from Revela (lazy-loaded)
router.get('/analysis/:analysisId/source/:moduleFqn(*)/function/:functionName', async (req, res) => {
  try {
    const { analysisId, moduleFqn, functionName } = req.params;
    logger.info('routes', `GET /api/analysis/${analysisId}/source/${moduleFqn}/function/${functionName} - Request received`);

    // Get analysis to find package ID and network
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const network = (analysis.network as Network) || 'mainnet';
    const packageId = analysis.packageId;

    // Extract module name from FQN (format: 0xPKG::module)
    const parts = moduleFqn.split('::');
    if (parts.length < 2) {
      return res.status(400).json({ error: 'Invalid module FQN format' });
    }
    const moduleName = parts.slice(1).join('::');

    // Check if this is a system package (0x1 to 0x9)
    if (/^0x0?[1-9]$/.test(packageId)) {
      logger.info('routes', `System package ${packageId} - source code not available`);
      return res.status(400).json({ 
        error: 'Source code not available for system packages',
        message: `Package ${packageId} is a Sui system package. Source code decompilation is not available for system packages (0x1-0x9).`,
        packageId,
        moduleName,
      });
    }

    // Get source code from Revela (uses cache if available)
    const moduleSource = await getModuleSourceCode(packageId, moduleName, network);

    // Get specific function
    const funcInfo = moduleSource.functions.find(f => f.name === functionName);
    if (!funcInfo) {
      return res.status(404).json({ error: 'Function not found in module' });
    }

    logger.info('routes', `GET /api/analysis/${analysisId}/source/${moduleFqn}/function/${functionName} - Success`);
    res.json({
      function: funcInfo,
      module: {
        packageId: moduleSource.packageId,
        moduleName: moduleSource.moduleName,
        sourceCode: moduleSource.sourceCode,
        method: 'revela',
      },
    });
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id/source/:moduleFqn/function/:functionName - Failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error.message || 'Failed to get function source code' });
  }
});

// Get module source code (all functions)
router.get('/analysis/:analysisId/source/:moduleFqn(*)', async (req, res) => {
  try {
    const { analysisId, moduleFqn } = req.params;
    logger.info('routes', `GET /api/analysis/${analysisId}/source/${moduleFqn} - Request received`);

    // Get analysis to find package ID and network
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const network = (analysis.network as Network) || 'mainnet';
    const packageId = analysis.packageId;

    // Extract module name from FQN
    const parts = moduleFqn.split('::');
    if (parts.length < 2) {
      return res.status(400).json({ error: 'Invalid module FQN format' });
    }
    const moduleName = parts.slice(1).join('::');

    // Check if this is a system package (0x1 to 0x9)
    if (/^0x0?[1-9]$/.test(packageId)) {
      logger.info('routes', `System package ${packageId} - source code not available`);
      return res.status(400).json({ 
        error: 'Source code not available for system packages',
        message: `Package ${packageId} is a Sui system package. Source code decompilation is not available for system packages (0x1-0x9).`,
        packageId,
        moduleName,
      });
    }

    // Get source code from Revela (uses cache if available)
    const moduleSource = await getModuleSourceCode(packageId, moduleName, network);

    logger.info('routes', `GET /api/analysis/${analysisId}/source/${moduleFqn} - Success`, {
      functionsCount: moduleSource.functions.length,
    });

    res.json({
      packageId: moduleSource.packageId,
      moduleName: moduleSource.moduleName,
      sourceCode: moduleSource.sourceCode,
      functions: moduleSource.functions,
      method: 'revela',
    });
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id/source/:moduleFqn - Failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error.message || 'Failed to get module source code' });
  }
});

// Clear source code cache for debugging
router.delete('/cache/source/:packageId', async (req, res) => {
  const { packageId } = req.params;
  
  try {
    await prisma.sourceCode.deleteMany({
      where: { packageId },
    });
    
    res.json({ 
      success: true, 
      message: `Cleared source code cache for package ${packageId}`,
    });
  } catch (error: any) {
    logger.error('routes', `Failed to clear cache for ${packageId}`, { error: error.message });
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Enrich analysis with Revela source code (POST to trigger enrichment)
router.post('/analysis/:analysisId/enrich', async (req, res) => {
  try {
    const { analysisId } = req.params;

    logger.info('routes', `POST /api/analysis/${analysisId}/enrich - Starting Revela enrichment`);

    // Start enrichment in background
    enrichAnalysisWithRevela(analysisId)
      .then(() => {
        logger.info('routes', `Revela enrichment completed for analysis ${analysisId}`);
      })
      .catch((error: any) => {
        logger.error('routes', `Revela enrichment failed for analysis ${analysisId}`, {
          error: error.message,
        });
      });

    res.json({ status: 'enriching', analysisId, method: 'revela' });
  } catch (error: any) {
    logger.error('routes', 'POST /api/analysis/:id/enrich - Failed', {
      error: error.message,
    });
    res.status(500).json({ error: error.message || 'Failed to start enrichment' });
  }
});

// Get enrichment status
router.get('/analysis/:analysisId/enrich/status', async (req, res) => {
  try {
    const { analysisId } = req.params;

    logger.debug('routes', `GET /api/analysis/${analysisId}/enrich/status`);

    const status = await getEnrichmentStatus(analysisId);

    res.json(status);
  } catch (error: any) {
    logger.error('routes', 'GET /api/analysis/:id/enrich/status - Failed', {
      error: error.message,
    });
    res.status(500).json({ error: error.message || 'Failed to get enrichment status' });
  }
});

// ============================================================================
// RAG & AI Explanation Routes
// ============================================================================

// Get module data with explanation
router.get('/modules/:id', async (req, res) => {
  try {
    let { id } = req.params;
    
    // Strip "mod:" prefix if present (from graph node IDs)
    if (id.startsWith('mod:')) {
      id = id.substring(4);
    }

    logger.info('routes', `GET /api/modules/${id}`, { originalId: req.params.id, cleanedId: id });

    // Try to find by ID first, then by fullName
    let module = await prisma.module.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        fullName: true,
        packageId: true,
        explanation: true,
        explanationStatus: true,
        ultraSummary: true,
        decompiledSource: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // If not found by ID, try by fullName
    if (!module) {
      module = await prisma.module.findUnique({
        where: { fullName: id },
        select: {
          id: true,
          name: true,
          fullName: true,
          packageId: true,
          explanation: true,
          explanationStatus: true,
          ultraSummary: true,
          decompiledSource: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    if (!module) {
      logger.warn('routes', `Module not found: ${id}`);
      return res.status(404).json({ error: 'Module not found' });
    }

    res.json(module);
  } catch (error: any) {
    logger.error('routes', 'GET /api/modules/:id - Failed', {
      error: error.message,
    });
    res.status(500).json({ error: error.message || 'Failed to get module data' });
  }
});

// Get package data with explanation
router.get('/packages/:id', async (req, res) => {
  try {
    let { id } = req.params;
    
    // Strip "pkg:" prefix if present (from graph node IDs)
    if (id.startsWith('pkg:')) {
      id = id.substring(4);
    }

    logger.info('routes', `GET /api/packages/${id}`, { originalId: req.params.id, cleanedId: id });

    // Try to find package by ID first, then by address
    let packageData = await prisma.package.findUnique({
      where: { id },
      select: {
        id: true,
        address: true,
        explanation: true,
        explanationStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // If not found by ID, try by address
    if (!packageData) {
      packageData = await prisma.package.findUnique({
        where: { address: id },
        select: {
          id: true,
          address: true,
          explanation: true,
          explanationStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    if (!packageData) {
      logger.warn('routes', `Package not found by ID or address: ${id}`);
      return res.status(404).json({ error: 'Package not found' });
    }

    logger.info('routes', `Found package: ${packageData.address}`, { 
      hasExplanation: !!packageData.explanation,
      explanationStatus: packageData.explanationStatus 
    });

    res.json(packageData);
  } catch (error: any) {
    logger.error('routes', 'GET /api/packages/:id - Failed', {
      error: error.message,
    });
    res.status(500).json({ error: error.message || 'Failed to get package data' });
  }
});

// Generate explanation for a module
router.post('/modules/:id/generate-explanation', async (req, res) => {
  try {
    let { id } = req.params;
    const { force = false } = req.body;
    
    // Strip "mod:" prefix if present
    if (id.startsWith('mod:')) {
      id = id.substring(4);
    }

    logger.info('routes', `POST /api/modules/${id}/generate-explanation`, { force, originalId: req.params.id });

    const { generateModuleExplanation } = await import('./services/rag/index.js');
    const result = await generateModuleExplanation(id, { force });

    res.json(result);
  } catch (error: any) {
    logger.error('routes', 'POST /api/modules/:id/generate-explanation - Failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error.message || 'Failed to generate module explanation' });
  }
});

// Generate explanation for a package
router.post('/packages/:id/generate-explanation', async (req, res) => {
  try {
    let { id } = req.params;
    const { force = false } = req.body;
    
    // Strip "pkg:" prefix if present
    if (id.startsWith('pkg:')) {
      id = id.substring(4);
    }

    logger.info('routes', `POST /api/packages/${id}/generate-explanation`, { force, originalId: req.params.id });

    const { generatePackageExplanation } = await import('./services/rag/index.js');
    const result = await generatePackageExplanation(id, { force });

    res.json(result);
  } catch (error: any) {
    logger.error('routes', 'POST /api/packages/:id/generate-explanation - Failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error.message || 'Failed to generate package explanation' });
  }
});

// RAG Chat
router.post('/rag-chat', async (req, res) => {
  try {
    const { question, chatId, analysisId, packageId, moduleId } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    logger.info('routes', 'POST /api/rag-chat', {
      hasQuestion: !!question,
      hasChatId: !!chatId,
      analysisId,
      packageId,
      moduleId,
    });

    const { ragChat } = await import('./services/rag/index.js');
    const result = await ragChat({
      question,
      chatId: chatId ? parseInt(chatId, 10) : undefined,
      analysisId,
      packageId,
      moduleId,
    });

    res.json(result);
  } catch (error: any) {
    logger.error('routes', 'POST /api/rag-chat - Failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error.message || 'Failed to process RAG chat' });
  }
});

// Get chat history
router.get('/rag-chat/:chatId/history', async (req, res) => {
  try {
    const { chatId } = req.params;

    logger.info('routes', `GET /api/rag-chat/${chatId}/history`);

    const { getChatHistory } = await import('./services/rag/index.js');
    const history = await getChatHistory(parseInt(chatId, 10));

    res.json({ messages: history });
  } catch (error: any) {
    logger.error('routes', 'GET /api/rag-chat/:chatId/history - Failed', {
      error: error.message,
    });
    res.status(500).json({ error: error.message || 'Failed to get chat history' });
  }
});

// List chat sessions (with optional filters including analysisId)
router.get('/rag-chats', async (req, res) => {
  try {
    const { analysisId, packageId, moduleId, limit } = req.query;

    logger.info('routes', 'GET /api/rag-chats', { analysisId, packageId, moduleId, limit });

    const { listChats } = await import('./services/rag/index.js');
    const chats = await listChats({
      analysisId: analysisId as string | undefined,
      packageId: packageId as string | undefined,
      moduleId: moduleId as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json(chats); // Return array directly for easier frontend use
  } catch (error: any) {
    logger.error('routes', 'GET /api/rag-chats - Failed', {
      error: error.message,
    });
    res.status(500).json({ error: error.message || 'Failed to list chats' });
  }
});

// Delete chat session
router.delete('/rag-chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;

    logger.info('routes', `DELETE /api/rag-chat/${chatId}`);

    const { deleteChat } = await import('./services/rag/index.js');
    await deleteChat(parseInt(chatId, 10));

    res.json({ success: true });
  } catch (error: any) {
    logger.error('routes', 'DELETE /api/rag-chat/:chatId - Failed', {
      error: error.message,
    });
    res.status(500).json({ error: error.message || 'Failed to delete chat' });
  }
});

// Index a module for RAG
router.post('/modules/:id/index', async (req, res) => {
  try {
    const { id } = req.params;

    logger.info('routes', `POST /api/modules/${id}/index`);

    const { indexModuleForRag } = await import('./services/rag/index.js');
    await indexModuleForRag(id);

    res.json({ success: true, message: 'Module indexed successfully' });
  } catch (error: any) {
    logger.error('routes', 'POST /api/modules/:id/index - Failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error.message || 'Failed to index module' });
  }
});

// Reindex all modules
router.post('/rag/reindex-all', async (req, res) => {
  try {
    logger.info('routes', 'POST /api/rag/reindex-all');

    const { reindexAllModules } = await import('./services/rag/index.js');
    
    // Start reindexing in background
    reindexAllModules({
      batchSize: 10,
      onProgress: (current, total) => {
        logger.info('routes', `Reindexing progress: ${current}/${total}`);
      },
    })
      .then((result) => {
        logger.info('routes', 'Reindexing complete', result);
      })
      .catch((error: any) => {
        logger.error('routes', 'Reindexing failed', { error: error.message });
      });

    res.json({ success: true, message: 'Reindexing started in background' });
  } catch (error: any) {
    logger.error('routes', 'POST /api/rag/reindex-all - Failed', {
      error: error.message,
    });
    res.status(500).json({ error: error.message || 'Failed to start reindexing' });
  }
});

export default router;

