import { getSuiClient, type Network } from './sui.js';
import prisma from './prismaClient.js';
import { extractFullyQualifiedTypes, extractPackageAddress, extractModuleName } from './normalize.js';
import { logger } from './logger.js';
import { extractModuleConstants, detectHardcodedFlags } from './moduleAnalysis.js';
import { queryObjectsByType, estimateObjectCount, type GraphQLObject } from './graphql.js';
import type {
  GraphData,
  PackageNode,
  ModuleNode,
  TypeNode,
  ObjectNode,
  AddressNode,
  EventNode,
  Edge,
  Flag,
  TypeStats,
  AnalysisConfig,
  ModuleConstant,
} from '@suilens/core';

const CRITICAL_TYPES = [
  'AdminCap',
  'UpgradeCap',
  'TreasuryCap',
  'State',
  'Config',
  'Treasury',
  'Vault',
  'Registry',
  'Cap',
];

/**
 * Check if a type is critical based on naming patterns
 * Critical types: AdminCap, UpgradeCap, TreasuryCap, Treasury, State, Config, Registry, Vault, any *Cap
 */
function isCriticalType(typeFqn: string, configCriticalTypes?: string[]): boolean {
  const typeName = typeFqn.split('::').pop() || '';
  
  // Check user-defined critical types first
  if (configCriticalTypes && configCriticalTypes.length > 0) {
    if (configCriticalTypes.some((ct) => typeFqn.includes(ct))) {
      return true;
    }
  }
  
  // Check built-in critical type patterns
  return CRITICAL_TYPES.some((ct) => {
    if (ct === 'Cap') {
      // Match any type ending with "Cap"
      return typeName.endsWith('Cap');
    }
    return typeName.includes(ct);
  });
}

/**
 * Helper to detect which network the package exists on
 * Tries mainnet first, then falls back to testnet
 */
async function detectPackageNetwork(packageId: string, preferredNetwork?: Network): Promise<Network> {
  const networksToTry: Network[] = preferredNetwork
    ? [preferredNetwork]
    : ['mainnet', 'testnet'];

  for (const network of networksToTry) {
    try {
      logger.debug('detectPackageNetwork', `Trying ${network} for package ${packageId}`);
      const client = getSuiClient(network);
      await client.getNormalizedMoveModulesByPackage({ package: packageId });
      logger.info('detectPackageNetwork', `Package ${packageId} found on ${network}`);
      return network;
    } catch (error: any) {
      logger.debug('detectPackageNetwork', `Package not found on ${network}`, { error: error.message });
      // If preferred network was specified and failed, don't fallback
      if (preferredNetwork) {
        throw error;
      }
      // Continue to next network
    }
  }

  throw new Error(`Package ${packageId} not found on any network (tried: ${networksToTry.join(', ')})`);
}

/**
 * Enhanced package analysis with structs, objects, events, and security flags
 * Supports recursive analysis of package dependencies
 */
export async function analyzePackage(
  config: AnalysisConfig & { packageId: string; userId?: string },
  onProgress?: (progress: number) => Promise<void>
): Promise<string> {
  const {
    packageId,
    maxPkgDepth = 1,
    network: preferredNetwork,
  } = config;

  // Detect which network the package is on (mainnet first, then testnet)
  logger.info('analyzePackageV2', 'Detecting package network...', { packageId, preferredNetwork });
  const detectedNetwork = await detectPackageNetwork(packageId, preferredNetwork);
  logger.info('analyzePackageV2', `Using network: ${detectedNetwork}`, { packageId });

  // Update config with detected network
  const configWithNetwork = { ...config, network: detectedNetwork };

  // If maxPkgDepth > 1, perform recursive analysis
  if (maxPkgDepth > 1) {
    return await analyzePackageRecursive(configWithNetwork, onProgress);
  }

  // Single package analysis - analyze and save
  return await analyzeSinglePackageAndSave(configWithNetwork, onProgress);
}

/**
 * Internal function to analyze a single package
 * Returns the graph data without saving it
 */
async function analyzeSinglePackageInternal(
  config: AnalysisConfig & { packageId: string; network: Network },
  onProgress?: (progress: number) => Promise<void>
): Promise<GraphData> {
  const {
    packageId,
    network,
    maxPkgDepth = 1,
    maxObjDepth = 1,
    typeCountThreshold = 100,
    sampleLargeTypes = true,
    objectSampleSize = 10,
    hardCapCritical = 5000,
    eventsWindowDays = 7,
    criticalTypes = CRITICAL_TYPES,
  } = config;

  logger.info('analyzeSinglePackage', `Starting analysis for package: ${packageId} on ${network}`, config);
  await onProgress?.(5);

  // Get the appropriate client for this network
  const suiClient = getSuiClient(network);

  try {
    // Fetch normalized modules from the package
    logger.debug('analyzeV2', `Fetching normalized modules from ${network} Sui RPC...`);
    const normalizedModules = await suiClient.getNormalizedMoveModulesByPackage({
      package: packageId,
    });

    const fetchedModuleCount = Object.keys(normalizedModules).length;
    logger.info('analyzeSinglePackage', `Fetched ${fetchedModuleCount} modules for package ${packageId}`, {
      moduleNames: Object.keys(normalizedModules),
    });
    await onProgress?.(15);

    // Data structures
    const packages = new Map<string, PackageNode>();
    const modules = new Map<string, ModuleNode>();
    const types = new Map<string, TypeNode>();
    const objects = new Map<string, ObjectNode>();
    const addresses = new Map<string, AddressNode>();
    const events = new Map<string, EventNode>();
    const edges: Edge[] = [];
    const flags: Flag[] = [];
    const typeStatsMap = new Map<string, TypeStats>();

    // Track package addresses
    const packageAddresses = new Set<string>();
    const packageDependencies = new Set<string>();

    // Step 1: Parse modules, extract structs, functions, and friends
    logger.info('analyzeSinglePackage', `Step 1: Parsing ${fetchedModuleCount} modules`);
    for (const [moduleName, moduleData] of Object.entries(normalizedModules)) {
      // Normalize module name
      let address: string;
      let module: string;

      if (moduleName.includes('::')) {
        const parts = moduleName.split('::');
        address = parts[0];
        module = parts.slice(1).join('::');
      } else {
        address = packageId;
        module = moduleName;
      }

      if (!address || !module) {
        logger.warn('analyzeV2', `Skipping invalid module name: ${moduleName}`);
        continue;
      }

      packageAddresses.add(address);
      const fullyQualifiedName = `${address}::${module}`;
      const moduleId: `mod:${string}` = `mod:${fullyQualifiedName}`;

      // Create package node if not exists
      if (!packages.has(address)) {
        packages.set(address, {
          id: `pkg:${address}`,
          address,
          displayName: address,
        });
      }

      // Extract functions
      const moduleFunctions: ModuleNode['functions'] = [];
      const moduleDependencies = new Set<string>();
      // Track function-level calls: caller -> (callee module, callee func)
      const functionCalls = new Map<string, Array<{ calleeModule: string; calleeFunc: string }>>();

      if (moduleData.exposedFunctions) {
        for (const [funcName, funcData] of Object.entries(moduleData.exposedFunctions)) {
          let visibility: 'Entry' | 'Public' | 'Private' | 'Friend' = 'Public';
          if (funcData.isEntry) {
            visibility = 'Entry';
          } else if (funcData.visibility === 'Friend') {
            visibility = 'Friend';
          } else if (funcData.visibility === 'Private') {
            visibility = 'Private';
          } else if (funcData.visibility === 'Public') {
            visibility = 'Public';
          }

          // Extract parameters and return type
          const parameters = funcData.parameters?.map((param: any) => ({
            name: param.name || 'param',
            type: typeof param === 'string' ? param : JSON.stringify(param),
          })) || [];

          const returnType = funcData.return ?
            (typeof funcData.return === 'string' ? funcData.return : JSON.stringify(funcData.return)) :
            'void';

          moduleFunctions.push({
            name: funcName,
            visibility,
            isEntry: funcData.isEntry || false,
            parameters,
            returnType,
          });

          // Extract dependencies from function parameters and detect cross-module calls
          if (funcData.parameters) {
            funcData.parameters.forEach((param: any) => {
              const paramTypes = extractFullyQualifiedTypes(param);
              paramTypes.forEach((type) => {
                const depPackage = extractPackageAddress(type);
                const depModule = extractModuleName(type);
                if (depPackage && depModule) {
                  const depModuleFqn = `${depPackage}::${depModule}`;

                  if (depPackage !== address) {
                    packageDependencies.add(depPackage);
                    moduleDependencies.add(depModuleFqn);

                    // Record the function call
                    if (!functionCalls.has(depModuleFqn)) {
                      functionCalls.set(depModuleFqn, []);
                    }
                    functionCalls.get(depModuleFqn)!.push({
                      calleeModule: depModuleFqn,
                      calleeFunc: '<via type reference>',
                    });
                  }
                }
              });
            });
          }

          // Also check return type for dependencies
          if (funcData.return) {
            const returnTypes = extractFullyQualifiedTypes(funcData.return);
            returnTypes.forEach((type) => {
              const depPackage = extractPackageAddress(type);
              const depModule = extractModuleName(type);
              if (depPackage && depModule && depPackage !== address) {
                packageDependencies.add(depPackage);
                moduleDependencies.add(`${depPackage}::${depModule}`);
              }
            });
          }
        }
      }

      // Extract friend declarations
      const friendModules: string[] = [];
      if (moduleData.friends && Array.isArray(moduleData.friends)) {
        for (const friend of moduleData.friends) {
          if (typeof friend === 'object' && friend.address && friend.name) {
            const friendFqn = `${friend.address}::${friend.name}`;
            friendModules.push(friendFqn);

            // Create MOD_FRIEND_ALLOW edge (callee -> caller)
            edges.push({
              kind: 'MOD_FRIEND_ALLOW',
              from: moduleId,
              to: `mod:${friendFqn}`,
            });
          }
        }
      }

      // Extract struct definitions (types)
      const typesDefined: string[] = [];
      const moduleFlags: string[] = [];

      if (moduleData.structs) {
        for (const [structName, structData] of Object.entries(moduleData.structs)) {
          const typeFqn = `${address}::${module}::${structName}`;
          typesDefined.push(typeFqn);

          // Extract abilities
          const abilities = structData.abilities?.abilities || [];
          const hasKey = abilities.includes('Key');
          
          // Log abilities for debugging
          if (abilities.length > 0) {
            logger.debug('parseModule', `Type ${typeFqn} has abilities: ${abilities.join(', ')}${hasKey ? ' [HAS KEY]' : ''}`);
          }

          // Extract fields
          const fields = structData.fields?.map((field: any) => ({
            name: field.name,
            type: typeof field.type === 'string' ? field.type : JSON.stringify(field.type),
          })) || [];

          // Create TypeNode
          const typeNode: TypeNode = {
            id: `type:${typeFqn}`,
            fqn: typeFqn,
            module: moduleId,
            fields,
            hasKey,
            abilities,
          };
          types.set(typeFqn, typeNode);

          // Create MOD_DEFINES_TYPE edge
          edges.push({
            kind: 'MOD_DEFINES_TYPE',
            from: moduleId,
            to: `type:${typeFqn}`,
          });

          // Create TYPE_USES_TYPE edges for struct composition
          if (structData.fields && Array.isArray(structData.fields)) {
            const usedTypesSet = new Set<string>(); // Track unique types used to avoid duplicates
            
            for (const field of structData.fields) {
              if (field.type) {
                // Extract all fully-qualified types from this field
                const fieldTypes = extractFullyQualifiedTypes(field.type);
                
                for (const usedTypeFqn of fieldTypes) {
                  // Only create edge if not already added (avoid duplicate edges)
                  if (!usedTypesSet.has(usedTypeFqn)) {
                    usedTypesSet.add(usedTypeFqn);
                    
                    edges.push({
                      kind: 'TYPE_USES_TYPE',
                      from: `type:${typeFqn}`,
                      to: `type:${usedTypeFqn}`,
                      fieldName: field.name,
                    });
                  }
                }
              }
            }
          }

          // Flag critical types
          if (criticalTypes.some((ct) => structName.includes(ct))) {
            moduleFlags.push(structName);
            flags.push({
              level: 'MED',
              kind: 'CriticalType',
              scope: 'type',
              refId: typeFqn,
              details: { structName, hasKey, abilities },
            });
          }
        }
      }

      // Extract module-level constants
      const moduleConstants: ModuleConstant[] = extractModuleConstants(moduleData);
      logger.debug('analyzeSinglePackage', `Extracted ${moduleConstants.length} constants from ${fullyQualifiedName}`);

      // Detect hardcoded values and emit security flags
      const hardcodedFlags = detectHardcodedFlags(moduleId, moduleConstants, new Map());
      hardcodedFlags.forEach((flag) => {
        flags.push(flag as Flag);
        if (flag.kind) {
          moduleFlags.push(flag.kind);
        }
      });

      // Create ModuleNode
      const moduleNode: ModuleNode = {
        id: moduleId,
        fullName: fullyQualifiedName,
        package: `pkg:${address}`,
        name: module,
        functions: moduleFunctions,
        typesDefined,
        friends: friendModules,
        flags: moduleFlags,
        constants: moduleConstants.length > 0 ? moduleConstants : undefined,
      };
      modules.set(fullyQualifiedName, moduleNode);
      logger.debug('analyzeSinglePackage', `Added module: ${fullyQualifiedName}`, {
        functionsCount: moduleFunctions.length,
        typesCount: typesDefined.length,
      });

      // Create PKG_CONTAINS edge
      edges.push({
        kind: 'PKG_CONTAINS',
        from: `pkg:${address}`,
        to: moduleId,
      });

      // Create MOD_CALLS edges with callType classification and enhanced call evidence
      moduleDependencies.forEach((depFqn) => {
        // Determine callType: friend, samePackage, or external
        let callType: 'friend' | 'samePackage' | 'external' = 'external';

        if (friendModules.includes(depFqn)) {
          callType = 'friend';
        } else {
          // Extract package address from dependency FQN
          const depPackageMatch = depFqn.match(/^(0x[a-fA-F0-9]+)::/);
          const depPackage = depPackageMatch ? depPackageMatch[1] : '';
          if (depPackage === address) {
            callType = 'samePackage';
          }
        }

        // Get detailed call information from functionCalls map
        const callDetails = functionCalls.get(depFqn) || [];
        const calls = callDetails.length > 0
          ? callDetails.map(call => ({
            callerFunc: 'detected',
            calleeModule: call.calleeModule,
            calleeFunc: call.calleeFunc,
          }))
          : [{ callerFunc: 'detected', calleeModule: depFqn, calleeFunc: '<inferred>' }];

        edges.push({
          kind: 'MOD_CALLS',
          from: moduleId,
          to: `mod:${depFqn}`,
          callType,
          calls,
        });
      });
    }

    await onProgress?.(35);

    // Step 2: Create package dependency edges
    logger.info('analyzeV2', 'Step 2: Creating package dependency edges');
    packageDependencies.forEach((depPackage) => {
      if (!packages.has(depPackage)) {
        packages.set(depPackage, {
          id: `pkg:${depPackage}`,
          address: depPackage,
          displayName: depPackage,
        });
      }

      edges.push({
        kind: 'PKG_DEPENDS',
        from: `pkg:${packageId}`,
        to: `pkg:${depPackage}`,
        evidence: [], // TODO: populate with actual evidence
      });
    });

    await onProgress?.(45);

    // Step 3: Skip object discovery during analysis (now lazy-loaded on demand)
    logger.info('analyzeV2', 'Step 3: Skipping object discovery (lazy-loaded on-demand)');
    // Objects will be fetched when user clicks "Show Objects" on a type
    await onProgress?.(65);

    // Step 4: Fetch recent events
    logger.info('analyzeV2', 'Step 4: Fetching recent events');
    await fetchEvents({
      suiClient,
      packageId,
      modules,
      events,
      edges,
      eventsWindowDays,
    });

    await onProgress?.(80);

    // Step 5: Security analysis
    logger.info('analyzeV2', 'Step 5: Running security analysis');
    await detectSecurityFlags({
      modules,
      types,
      objects,
      flags,
    });

    await onProgress?.(90);

    // Build final graph data
    const graphData: GraphData = {
      packages: Array.from(packages.values()),
      modules: Array.from(modules.values()),
      types: Array.from(types.values()),
      objects: Array.from(objects.values()),
      addresses: Array.from(addresses.values()),
      events: Array.from(events.values()),
      edges,
      stats: {
        types: Object.fromEntries(typeStatsMap.entries()),
      },
      flags,
    };

    logger.info('analyzeSinglePackage', `Graph data created for ${packageId}`, {
      packages: graphData.packages.length,
      modules: graphData.modules.length,
      types: graphData.types.length,
      objects: graphData.objects.length,
      events: graphData.events.length,
      edges: graphData.edges.length,
      flags: graphData.flags.length,
      moduleNames: graphData.modules.map(m => m.fullName),
    });

    await onProgress?.(100);

    logger.info('analyzeSinglePackage', `✅ Analysis complete for ${packageId}`, {
      totalModules: graphData.modules.length,
      totalTypes: graphData.types.length,
    });
    return graphData;
  } catch (error: any) {
    logger.error('analyzeSinglePackage', 'Analysis failed', {
      error: error.message,
      stack: error.stack,
      packageId,
    });
    throw new Error(`Failed to analyze package: ${error.message}`);
  }
}

/**
 * Wrapper for single package analysis that saves to database
 */
async function analyzeSinglePackageAndSave(
  config: AnalysisConfig & { packageId: string; network: Network; userId?: string },
  onProgress?: (progress: number) => Promise<void>
): Promise<string> {
  const { packageId, maxPkgDepth = 1 } = config;

  const graphData = await analyzeSinglePackageInternal(config, onProgress);

  // Save to database
  logger.debug('analyzeSinglePackageAndSave', 'Saving analysis to database...');
  const analysis = await saveAnalysis(packageId, maxPkgDepth, config, graphData);

  logger.info('analyzeSinglePackageAndSave', `✅ Analysis saved with ID: ${analysis.id}, slug: ${analysis.slug}`);
  return analysis.id;
}

// Helper functions

/**
 * Recursively scan a snapshot object for Sui object IDs
 * Sui object IDs are strings matching: 0x[a-fA-F0-9]{64}
 */
function scanSnapshotForObjectIds(snapshot: Record<string, unknown>, depth = 0, maxDepth = 4, maxHits = 20): string[] {
  const objectIds = new Set<string>();
  const SUI_OBJECT_ID_REGEX = /^0x[a-fA-F0-9]{64}$/;
  
  // Safety: limit recursion depth
  if (depth > maxDepth) {
    return [];
  }
  
  function walk(value: any, currentDepth: number): void {
    // Stop if we've hit the depth limit or found enough IDs
    if (currentDepth > maxDepth || objectIds.size >= maxHits) {
      return;
    }
    
    if (typeof value === 'string' && SUI_OBJECT_ID_REGEX.test(value)) {
      objectIds.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(item => walk(item, currentDepth + 1));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(v => walk(v, currentDepth + 1));
    }
  }
  
  walk(snapshot, depth);
  return Array.from(objectIds);
}

async function discoverObjects(params: {
  network: Network;
  suiClient: any;
  types: Map<string, TypeNode>;
  objects: Map<string, ObjectNode>;
  addresses: Map<string, AddressNode>;
  edges: Edge[];
  flags: Flag[];
  typeStatsMap: Map<string, TypeStats>;
  configCriticalTypes: string[];
  typeCountThreshold: number;
  sampleLargeTypes: boolean;
  objectSampleSize: number;
  hardCapCritical: number;
  maxObjDepth: number;
}): Promise<void> {
  const {
    network,
    suiClient,
    types,
    objects,
    addresses,
    edges,
    flags,
    typeStatsMap,
    configCriticalTypes,
    typeCountThreshold,
    sampleLargeTypes,
    objectSampleSize,
    hardCapCritical,
    maxObjDepth,
  } = params;

  logger.info('discoverObjects', `Discovering objects for ${types.size} types`);

  // Filter types with 'key' ability (on-chain object types)
  const objectTypes = Array.from(types.values()).filter((t) => t.hasKey);
  logger.info('discoverObjects', `Found ${objectTypes.length} object types (has key)`);
  
  if (objectTypes.length === 0) {
    logger.warn('discoverObjects', 'No object types found with hasKey ability!');
    return;
  }
  
  // Log the types we'll query
  logger.debug('discoverObjects', 'Object types to query:', objectTypes.map(t => t.fqn).join(', '));

  for (const type of objectTypes) {
    try {
      // Check if type is critical using the new detection logic
      const critical = isCriticalType(type.fqn, configCriticalTypes);
      
      logger.info('discoverObjects', `Processing type: ${type.fqn} [${critical ? 'CRITICAL' : 'non-critical'}]`);

      // Step 1: Estimate count using GraphQL (first page)
      const { estimatedCount, hasMore } = await estimateObjectCount({
        network,
        structType: type.fqn,
      });

      logger.info('discoverObjects', `Estimated count for ${type.fqn}: ${estimatedCount}${hasMore ? '+' : ''}`);

      // Step 2: Decide fetch strategy based on rules
      let fetchMode: 'all' | 'sample';
      let fetchLimit: number;

      if (critical) {
        // Critical types → fetch all (up to hard cap)
        fetchMode = 'all';
        fetchLimit = hardCapCritical;
        logger.info('discoverObjects', `Strategy: FETCH ALL (critical type, cap=${hardCapCritical})`);
      } else if (estimatedCount <= typeCountThreshold && !hasMore) {
        // Non-critical, small count → fetch all
        fetchMode = 'all';
        fetchLimit = typeCountThreshold;
        logger.info('discoverObjects', `Strategy: FETCH ALL (count ≤ threshold=${typeCountThreshold})`);
      } else if (sampleLargeTypes) {
        // Non-critical, large count → sample
        fetchMode = 'sample';
        fetchLimit = objectSampleSize;
        logger.info('discoverObjects', `Strategy: SAMPLE (size=${objectSampleSize})`);
      } else {
        // User disabled sampling, fetch up to threshold
        fetchMode = 'all';
        fetchLimit = typeCountThreshold;
        logger.info('discoverObjects', `Strategy: FETCH ALL (sampling disabled, cap=${typeCountThreshold})`);
      }

      // Step 3: Fetch objects using GraphQL
      let allGraphQLObjects: GraphQLObject[] = [];
      let cursor: string | null = null;
      let pageCount = 0;

      do {
        pageCount++;
        const result = await queryObjectsByType({
          network,
          structType: type.fqn,
          limit: 50,
          cursor: cursor || undefined,
        });

        allGraphQLObjects.push(...result.objects);
        cursor = result.nextCursor;

        logger.debug('discoverObjects', `Page ${pageCount}: fetched ${result.objects.length} objects, total=${allGraphQLObjects.length}`);

        // Stop if we've reached our limit
        if (allGraphQLObjects.length >= fetchLimit) {
          logger.info('discoverObjects', `Reached fetch limit (${fetchLimit}), stopping pagination`);
          break;
        }

        // Stop if no more pages
        if (!result.hasNextPage || !cursor) {
          break;
        }

        // Safety: max 100 pages
        if (pageCount >= 100) {
          logger.warn('discoverObjects', `Reached max page count (100), stopping pagination`);
          break;
        }
      } while (cursor);

      // Trim to exact limit if we over-fetched
      if (allGraphQLObjects.length > fetchLimit) {
        allGraphQLObjects = allGraphQLObjects.slice(0, fetchLimit);
      }

      logger.info('discoverObjects', `Fetched ${allGraphQLObjects.length} objects for type ${type.fqn}`);

      // Step 4: Process each fetched object
      for (const gqlObj of allGraphQLObjects) {
        try {
          const objId = gqlObj.address;

          // Parse owner from GraphQL response
          let ownerData: ObjectNode['owner'] = { kind: 'Shared' };
          let isShared = false;

          if (gqlObj.owner.__typename === 'AddressOwner' && gqlObj.owner.owner?.address) {
            const ownerAddress = gqlObj.owner.owner.address;
            ownerData = { kind: 'AddressOwner', address: ownerAddress };

            // Create address node
            if (!addresses.has(ownerAddress)) {
              addresses.set(ownerAddress, {
                id: `addr:${ownerAddress}`,
                address: ownerAddress,
              });
            }

            // Create OBJ_OWNED_BY edge
            edges.push({
              kind: 'OBJ_OWNED_BY',
              from: `obj:${objId}`,
              to: `addr:${ownerAddress}`,
            });
          } else if (gqlObj.owner.__typename === 'Shared') {
            ownerData = { kind: 'Shared' };
            isShared = true;
          } else if (gqlObj.owner.__typename === 'Immutable') {
            ownerData = { kind: 'Immutable' };
          }

          // Create ObjectNode
          const objectNode: ObjectNode = {
            id: `obj:${objId}`,
            objectId: objId,
            typeFqn: type.fqn,
            owner: ownerData,
            shared: isShared,
            version: gqlObj.version?.toString(),
            digest: gqlObj.digest,
            snapshot: gqlObj.asMoveObject?.contents?.json || {},
          };
          objects.set(objId, objectNode);

          // Create OBJ_INSTANCE_OF edge
          edges.push({
            kind: 'OBJ_INSTANCE_OF',
            from: `obj:${objId}`,
            to: type.id,
          });

          // Scan snapshot for object references (OBJ_REFERS_OBJ)
          if (objectNode.snapshot && typeof objectNode.snapshot === 'object') {
            const referencedObjectIds = scanSnapshotForObjectIds(objectNode.snapshot);
            for (const refObjId of referencedObjectIds) {
              // Create OBJ_REFERS_OBJ edge
              edges.push({
                kind: 'OBJ_REFERS_OBJ',
                from: `obj:${objId}`,
                to: `obj:${refObjId}`,
              });
              
              // Create placeholder object node if not exists
              if (!objects.has(refObjId)) {
                objects.set(refObjId, {
                  id: `obj:${refObjId}`,
                  objectId: refObjId,
                  typeFqn: 'unknown',
                  owner: { kind: 'Shared' },
                  shared: false,
                });
              }
            }
          }

          // Check for dynamic fields (if maxObjDepth > 0)
          if (maxObjDepth > 0) {
            try {
              const dynamicFields = await suiClient.getDynamicFields({ parentId: objId });
              for (const df of dynamicFields.data) {
                if (df.objectId) {
                  // Create OBJ_DF_CHILD edge
                  edges.push({
                    kind: 'OBJ_DF_CHILD',
                    from: `obj:${objId}`,
                    to: `obj:${df.objectId}`,
                  });
                  
                  // Create child object stub if not exists
                  if (!objects.has(df.objectId)) {
                    // Try to fetch child object details
                    try {
                      const childObjData = await suiClient.getObject({
                        id: df.objectId,
                        options: { showOwner: true, showType: true },
                      });
                      
                      if (childObjData.data) {
                        const childOwner = childObjData.data.owner;
                        let childOwnerData: ObjectNode['owner'] = { kind: 'Shared' };
                        
                        if (childOwner && typeof childOwner === 'object') {
                          if ('AddressOwner' in childOwner) {
                            childOwnerData = { kind: 'AddressOwner', address: childOwner.AddressOwner };
                          } else if ('Shared' in childOwner) {
                            childOwnerData = { kind: 'Shared' };
                          } else if ('Immutable' in childOwner) {
                            childOwnerData = { kind: 'Immutable' };
                          } else if ('ObjectOwner' in childOwner) {
                            childOwnerData = { kind: 'ObjectOwner', address: childOwner.ObjectOwner };
                          }
                        }
                        
                        objects.set(df.objectId, {
                          id: `obj:${df.objectId}`,
                          objectId: df.objectId,
                          typeFqn: childObjData.data.type || 'unknown',
                          owner: childOwnerData,
                          shared: 'Shared' in (childOwner || {}),
                        });
                      }
                    } catch {
                      // Create minimal placeholder if fetch fails
                      objects.set(df.objectId, {
                        id: `obj:${df.objectId}`,
                        objectId: df.objectId,
                        typeFqn: 'unknown',
                        owner: { kind: 'Shared' },
                        shared: false,
                      });
                    }
                  }
                }
              }
            } catch (dfError) {
              // Dynamic fields query might fail, continue
              logger.debug('discoverObjects', `Failed to fetch dynamic fields for ${objId}`);
            }
          }
        } catch (objError: any) {
          logger.warn('discoverObjects', `Failed to process object ${gqlObj.address}:`, objError.message);
        }
      }

      // Step 5: Store TypeStats
      const actualCount = hasMore ? estimatedCount + (allGraphQLObjects.length > estimatedCount ? allGraphQLObjects.length - estimatedCount : 0) : allGraphQLObjects.length;
      typeStatsMap.set(type.fqn, {
        typeFqn: type.fqn,
        count: actualCount,
        sampled: allGraphQLObjects.length,
        shared: Array.from(objects.values())
          .filter((o) => o.typeFqn === type.fqn && o.shared)
          .length,
        uniqueOwners: new Set(
          Array.from(objects.values())
            .filter((o) => o.typeFqn === type.fqn && o.owner.address)
            .map((o) => o.owner.address)
        ).size,
      });

      logger.info('discoverObjects', `Stats for ${type.fqn}: count=${actualCount}, sampled=${allGraphQLObjects.length}, shared=${typeStatsMap.get(type.fqn)!.shared}, uniqueOwners=${typeStatsMap.get(type.fqn)!.uniqueOwners}`);

    } catch (error: any) {
      logger.error('discoverObjects', `Error processing type ${type.fqn}:`, {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  logger.info('discoverObjects', `Total objects discovered: ${objects.size}`);
}


async function fetchEvents(params: {
  suiClient: any;
  packageId: string;
  modules: Map<string, ModuleNode>;
  events: Map<string, EventNode>;
  edges: Edge[];
  eventsWindowDays: number;
}): Promise<void> {
  const { suiClient, packageId, modules, events, edges, eventsWindowDays } = params;

  logger.info('fetchEvents', `Fetching events from last ${eventsWindowDays} days`);

  try {
    // Query package events (Publish, Upgrade)
    const queryFilter = { Package: packageId };

    try {
      const eventResponse = await suiClient.queryEvents({
        query: queryFilter,
        limit: 100,
      });

      logger.info('fetchEvents', `Found ${eventResponse.data.length} events`);

      for (const evt of eventResponse.data) {
        const eventId = `${evt.id.txDigest}:${evt.id.eventSeq}`;

        // Parse event type
        let kind = 'Custom';
        let modName: string | undefined;

        if (evt.type.includes('::publish::')) {
          kind = 'Publish';
        } else if (evt.type.includes('::upgrade::')) {
          kind = 'Upgrade';
        } else if (evt.type.includes('::mint::')) {
          kind = 'Mint';
        } else if (evt.type.includes('::burn::')) {
          kind = 'Burn';
        }

        // Try to extract module name from event type
        const typeMatch = evt.type.match(/^0x[a-fA-F0-9]+::([^:]+)::/);
        if (typeMatch) {
          modName = typeMatch[1];
        }

        // Create EventNode
        const eventNode: EventNode = {
          id: `evt:${eventId}`,
          kind,
          pkg: `pkg:${packageId}`,
          mod: modName ? `mod:${packageId}::${modName}` : undefined,
          ts: evt.timestampMs ? parseInt(evt.timestampMs, 10) : undefined,
          tx: evt.id.txDigest,
          data: evt.parsedJson as any,
          sender: evt.sender,
        };
        events.set(eventId, eventNode);

        // Create edges
        if (modName && modules.has(`${packageId}::${modName}`)) {
          edges.push({
            kind: 'MOD_EMITS_EVENT',
            from: `mod:${packageId}::${modName}`,
            to: `evt:${eventId}`,
          });
        }

        edges.push({
          kind: 'PKG_EMITS_EVENT',
          from: `pkg:${packageId}`,
          to: `evt:${eventId}`,
        });
      }
    } catch (eventError: any) {
      logger.warn('fetchEvents', `Failed to query events:`, eventError.message);
    }

    logger.info('fetchEvents', `Total events fetched: ${events.size}`);
  } catch (error: any) {
    logger.error('fetchEvents', 'Failed to fetch events:', error.message);
  }
}

async function detectSecurityFlags(params: {
  modules: Map<string, ModuleNode>;
  types: Map<string, TypeNode>;
  objects: Map<string, ObjectNode>;
  flags: Flag[];
}): Promise<void> {
  const { modules, types, objects, flags } = params;

  logger.info('detectSecurityFlags', 'Running security analysis');

  // Module-level flags
  for (const mod of modules.values()) {
    // Check for admin/upgrade capabilities
    if (mod.typesDefined.some((t) => t.includes('AdminCap'))) {
      flags.push({
        level: 'HIGH',
        kind: 'AdminCap',
        scope: 'module',
        refId: mod.id,
        details: { message: 'Module defines AdminCap type' },
      });
    }

    if (mod.typesDefined.some((t) => t.includes('UpgradeCap'))) {
      flags.push({
        level: 'HIGH',
        kind: 'UpgradeCap',
        scope: 'module',
        refId: mod.id,
        details: { message: 'Module defines UpgradeCap type' },
      });
    }

    // Check for mint/burn functions
    const hasMint = mod.functions.some((f) => f.name.toLowerCase().includes('mint'));
    const hasBurn = mod.functions.some((f) => f.name.toLowerCase().includes('burn'));

    if (hasMint) {
      flags.push({
        level: 'MED',
        kind: 'MintFunction',
        scope: 'module',
        refId: mod.id,
        details: { message: 'Module has mint function' },
      });
    }

    if (hasBurn) {
      flags.push({
        level: 'MED',
        kind: 'BurnFunction',
        scope: 'module',
        refId: mod.id,
        details: { message: 'Module has burn function' },
      });
    }

    // Check for pause/unpause functions
    const hasPause = mod.functions.some((f) =>
      ['pause', 'unpause', 'set_pause'].includes(f.name.toLowerCase())
    );
    if (hasPause) {
      flags.push({
        level: 'MED',
        kind: 'PauseFunction',
        scope: 'module',
        refId: mod.id,
        details: { message: 'Module has pause/unpause function' },
      });
    }

    // Check for fee-setting functions
    const hasSetFee = mod.functions.some((f) =>
      f.name.toLowerCase().includes('set_fee') || f.name.toLowerCase().includes('update_fee')
    );
    if (hasSetFee) {
      flags.push({
        level: 'LOW',
        kind: 'SetFeeFunction',
        scope: 'module',
        refId: mod.id,
        details: { message: 'Module has fee-setting function' },
      });
    }

    // Check for blacklist functions
    const hasBlacklist = mod.functions.some((f) =>
      f.name.toLowerCase().includes('blacklist') || f.name.toLowerCase().includes('whitelist')
    );
    if (hasBlacklist) {
      flags.push({
        level: 'MED',
        kind: 'BlacklistFunction',
        scope: 'module',
        refId: mod.id,
        details: { message: 'Module has blacklist/whitelist function' },
      });
    }
  }

  // Type-level flags
  for (const type of types.values()) {
    // Check for types without key ability but with store (potential issues)
    if (!type.hasKey && type.abilities?.includes('Store')) {
      flags.push({
        level: 'LOW',
        kind: 'StoreWithoutKey',
        scope: 'type',
        refId: type.id,
        details: { message: 'Type has store but not key ability' },
      });
    }

    // Check for types with drop ability (can be destroyed without unwrapping)
    if (type.abilities?.includes('Drop')) {
      flags.push({
        level: 'LOW',
        kind: 'Droppable',
        scope: 'type',
        refId: type.id,
        details: { message: 'Type has drop ability' },
      });
    }
  }

  // Object-level flags
  for (const obj of objects.values()) {
    // Check for single EOA owner of critical caps
    if (
      obj.owner.kind === 'AddressOwner' &&
      (obj.typeFqn.includes('AdminCap') ||
        obj.typeFqn.includes('UpgradeCap') ||
        obj.typeFqn.includes('TreasuryCap'))
    ) {
      flags.push({
        level: 'HIGH',
        kind: 'SingleOwnerCap',
        scope: 'object',
        refId: obj.id,
        details: {
          message: 'Critical capability owned by single address',
          owner: obj.owner.address,
          type: obj.typeFqn,
        },
      });
    }

    // Check for unsafe shared objects
    if (obj.shared && obj.typeFqn.includes('Treasury')) {
      flags.push({
        level: 'HIGH',
        kind: 'UnsafeShared',
        scope: 'object',
        refId: obj.id,
        details: {
          message: 'Treasury object is shared (potential security risk)',
          type: obj.typeFqn,
        },
      });
    }
  }

  logger.info('detectSecurityFlags', `Generated ${flags.length} security flags`);
}

async function saveAnalysis(
  packageId: string,
  depth: number,
  config: AnalysisConfig & { network: Network; userId?: string },
  graphData: GraphData
): Promise<{ id: string; slug: string }> {
  // Generate slug
  const { generateSlug } = await import('./auth.js');
  const slug = generateSlug(packageId, config.userId || 'anonymous');
  
  const analysis = await prisma.analysis.create({
    data: {
      packageId,
      network: config.network,
      depth,
      paramsJson: config as any,
      summaryJson: graphData as any,
      userId: config.userId || null,
      slug,
    },
  });

  logger.info('analyzeV2', `Analysis saved with ID: ${analysis.id}, slug: ${analysis.slug} for network: ${config.network}`);
  return analysis;
}

/**
 * Recursive package analysis - analyzes package and its dependencies
 */
async function analyzePackageRecursive(
  config: AnalysisConfig & { packageId: string; network: Network; userId?: string },
  onProgress?: (progress: number) => Promise<void>
): Promise<string> {
  const { packageId, maxPkgDepth = 1, network } = config;

  logger.info('analyzePackageRecursive', `Starting recursive analysis for ${packageId} with depth ${maxPkgDepth}`);

  // Track analyzed packages to avoid cycles
  const analyzedPackages = new Set<string>();
  const allGraphData: GraphData[] = [];

  // Helper function to analyze a single package
  async function analyzeSinglePackage(
    pkgId: string,
    currentDepth: number,
    progressOffset: number,
    progressRange: number
  ): Promise<void> {
    if (currentDepth > maxPkgDepth || analyzedPackages.has(pkgId)) {
      return;
    }

    analyzedPackages.add(pkgId);
    logger.info('analyzePackageRecursive', `Analyzing package ${pkgId} at depth ${currentDepth}`);

    try {
      // Create config for this package
      const singleConfig = { ...config, packageId: pkgId, maxPkgDepth: 1 };

      // Create progress callback that scales to our range
      const scaledProgress = async (p: number) => {
        const scaledP = progressOffset + (p * progressRange / 100);
        await onProgress?.(Math.round(Math.min(scaledP, 95)));
      };

      // Analyze package directly (without saving)
      const graphData = await analyzeSinglePackageInternal(singleConfig, scaledProgress);

      // Add to collection
      allGraphData.push(graphData);

      logger.info('analyzePackageRecursive', `Completed analysis of ${pkgId}`, {
        packages: graphData.packages.length,
        modules: graphData.modules.length,
        types: graphData.types.length,
      });

      // Extract package dependencies for next level
      if (currentDepth < maxPkgDepth) {
        const dependencies = new Set<string>();

        // Find PKG_DEPENDS edges
        graphData.edges.forEach((edge: Edge) => {
          if (edge.kind === 'PKG_DEPENDS') {
            const depPkgId = edge.to.replace('pkg:', '');
            if (!analyzedPackages.has(depPkgId)) {
              dependencies.add(depPkgId);
            }
          }
        });

        // Also find external MOD_CALLS (different packages)
        graphData.edges.forEach((edge: Edge) => {
          if (edge.kind === 'MOD_CALLS' && (edge as any).callType === 'external') {
            const targetModule = edge.to.replace('mod:', '');
            const match = targetModule.match(/^(0x[a-fA-F0-9]+)::/);
            if (match) {
              const depPkgId = match[1];
              if (!analyzedPackages.has(depPkgId)) {
                dependencies.add(depPkgId);
              }
            }
          }
        });

        logger.info('analyzePackageRecursive', `Found ${dependencies.size} dependencies for ${pkgId}`);

        // Recursively analyze dependencies
        const depArray = Array.from(dependencies);
        const depProgressRange = progressRange / (depArray.length + 1);

        for (let i = 0; i < depArray.length; i++) {
          const depPkgId = depArray[i];
          const depProgressOffset = Math.round(progressOffset + depProgressRange * (i + 1));
          await analyzeSinglePackage(depPkgId, currentDepth + 1, depProgressOffset, depProgressRange);
        }
      }
    } catch (error: any) {
      logger.error('analyzePackageRecursive', `Failed to analyze ${pkgId}`, { error: error.message });
      // Continue with other packages even if one fails
    }
  }

  // Start recursive analysis from root package
  await analyzeSinglePackage(packageId, 1, 0, 90);

  // Merge all graph data
  logger.info('analyzePackageRecursive', `Merging ${allGraphData.length} package graphs`);
  const mergedGraph = mergeGraphs(allGraphData);

  // Save merged analysis
  await onProgress?.(95);
  const analysis = await saveAnalysis(packageId, maxPkgDepth, config, mergedGraph);

  await onProgress?.(100);
  logger.info('analyzePackageRecursive', `✅ Recursive analysis complete! ID: ${analysis.id}`);

  return analysis.id;
}

/**
 * Merge multiple graph data structures into one
 */
function mergeGraphs(graphs: GraphData[]): GraphData {
  logger.info('mergeGraphs', `Starting merge of ${graphs.length} graphs`, {
    graphModuleCounts: graphs.map((g, i) => ({
      graphIndex: i,
      modules: g.modules.length,
      packages: g.packages.length,
    })),
  });

  const merged: GraphData = {
    packages: [],
    modules: [],
    types: [],
    objects: [],
    addresses: [],
    events: [],
    edges: [],
    stats: { types: {} },
    flags: [],
  };

  // Use Maps to deduplicate by ID
  const packagesMap = new Map<string, PackageNode>();
  const modulesMap = new Map<string, ModuleNode>();
  const typesMap = new Map<string, TypeNode>();
  const objectsMap = new Map<string, ObjectNode>();
  const addressesMap = new Map<string, AddressNode>();
  const eventsMap = new Map<string, EventNode>();
  const edgesSet = new Set<string>(); // Use serialized edge as key

  for (const graph of graphs) {
    logger.debug('mergeGraphs', 'Merging graph', {
      packages: graph.packages.length,
      modules: graph.modules.length,
      types: graph.types.length,
      edges: graph.edges.length,
    });

    // Merge packages
    graph.packages.forEach((pkg: PackageNode) => packagesMap.set(pkg.id, pkg));

    // Merge modules
    graph.modules.forEach((mod: ModuleNode) => {
      if (modulesMap.has(mod.id)) {
        logger.warn('mergeGraphs', `Duplicate module ID: ${mod.id}`);
      }
      modulesMap.set(mod.id, mod);
    });

    // Merge types
    graph.types.forEach((type: TypeNode) => typesMap.set(type.id, type));

    // Merge objects
    graph.objects.forEach((obj: ObjectNode) => objectsMap.set(obj.id, obj));

    // Merge addresses
    graph.addresses.forEach((addr: AddressNode) => addressesMap.set(addr.id, addr));

    // Merge events
    graph.events.forEach((evt: EventNode) => eventsMap.set(evt.id, evt));

    // Merge edges (deduplicate)
    graph.edges.forEach((edge: Edge) => {
      const key = `${edge.kind}:${edge.from}:${edge.to}`;
      if (!edgesSet.has(key)) {
        edgesSet.add(key);
        merged.edges.push(edge);
      }
    });

    // Merge stats
    Object.entries(graph.stats.types).forEach(([typeFqn, stats]) => {
      merged.stats.types[typeFqn] = stats;
    });

    // Merge flags
    merged.flags.push(...graph.flags);
  }

  // Convert Maps back to arrays
  merged.packages = Array.from(packagesMap.values());
  merged.modules = Array.from(modulesMap.values());
  merged.types = Array.from(typesMap.values());
  merged.objects = Array.from(objectsMap.values());
  merged.addresses = Array.from(addressesMap.values());
  merged.events = Array.from(eventsMap.values());

  logger.info('mergeGraphs', 'Graph merge complete', {
    packages: merged.packages.length,
    modules: merged.modules.length,
    types: merged.types.length,
    objects: merged.objects.length,
    events: merged.events.length,
    edges: merged.edges.length,
  });

  return merged;
}

