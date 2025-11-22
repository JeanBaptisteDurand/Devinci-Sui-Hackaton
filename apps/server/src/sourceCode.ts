import prisma from './prismaClient.js';
import { logger } from './logger.js';
import { getSuiClient } from './sui.js';
import type { Network } from './sui.js';

export interface FunctionCall {
  module: string; // e.g., "0x2::transfer" or "subscription"
  func: string; // e.g., "transfer"
}

export interface FunctionInfo {
  name: string;
  visibility: string; // "public" | "public(friend)" | "entry" | "private"
  params: string[]; // Parameter types
  calls: FunctionCall[]; // Functions called by this function
}

export interface ModuleSourceCode {
  packageId: string;
  moduleName: string;
  network: Network;
  sourceCode: string; // Full source code
  functions: FunctionInfo[];
}

/**
 * Step 1: Get module Base64 from Sui SDK (moduleMap)
 */
async function getModuleBase64(
  packageId: string,
  moduleName: string,
  network: Network
): Promise<string> {
  const suiClient = getSuiClient(network);

  logger.debug('sourceCode', `Fetching BCS data for package ${packageId}`);

  try {
    // Get package object with BCS enabled
    const pkg: any = await suiClient.getObject({
      id: packageId,
      options: { showBcs: true },
    });

    if (!pkg?.data?.bcs) {
      throw new Error('Package object does not contain BCS data');
    }

    const bcsData = pkg.data.bcs;
    
    // Extract moduleMap (map of module name -> Base64 compiled bytecode)
    if (!bcsData.moduleMap || typeof bcsData.moduleMap !== 'object') {
      throw new Error('BCS data does not contain moduleMap');
    }

    const moduleMap = bcsData.moduleMap as Record<string, string>;
    
    logger.debug('sourceCode', `Available modules in moduleMap:`, {
      modules: Object.keys(moduleMap),
    });

    // Get the Base64 for our specific module
    const moduleBase64 = moduleMap[moduleName];
    
    if (!moduleBase64) {
      throw new Error(`Module "${moduleName}" not found in moduleMap. Available: ${Object.keys(moduleMap).join(', ')}`);
    }

    logger.info('sourceCode', `Got Base64 bytecode for ${moduleName} (${moduleBase64.length} chars)`);
    
    return moduleBase64;
  } catch (error: any) {
    logger.error('sourceCode', `Failed to get module Base64 for ${packageId}::${moduleName}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Step 2: Call suigpt.tools decompiler API
 */
async function decompileWithSuiGPT(
  moduleBase64: string,
  network: Network
): Promise<string> {
  const apiUrl = 'https://suigpt.tools/api/move/revela';
  
  logger.info('sourceCode', '📥 Calling SuiGPT decompilation API', {
    apiUrl,
    network,
    bytecodeLength: moduleBase64.length,
    timeout: '60s',
  });

  try {
    // Increased timeout for large modules (60 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const startTime = Date.now();
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        move_base64: moduleBase64,
        network: network,
        openai_api_key: null,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('sourceCode', '❌ Decompilation API error', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 200),
        duration: `${duration}ms`,
      });
      throw new Error(`SuiGPT API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
      message?: string;
      decompiled_code?: string;
    };
    
    logger.debug('sourceCode', `SuiGPT API response:`, {
      message: data.message,
      hasDecompiledCode: !!data.decompiled_code,
    });

    if (!data.decompiled_code) {
      logger.error('sourceCode', '❌ No decompiled code in response', {
        message: data.message,
      });
      throw new Error(`SuiGPT API did not return decompiled code: ${data.message || 'Unknown error'}`);
    }

    const sourceCode = data.decompiled_code;
    
    if (!sourceCode || sourceCode.trim().length === 0) {
      logger.error('sourceCode', '❌ Empty source code returned');
      throw new Error('SuiGPT returned empty source code');
    }

    logger.info('sourceCode', '✅ Decompilation successful', {
      duration: `${duration}ms`,
      sourceCodeLength: sourceCode.length,
      sourceCodePreview: sourceCode.substring(0, 200) + '...',
    });
    
    return sourceCode;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.error('sourceCode', '❌ Decompilation timeout', { timeout: '60s' });
      throw new Error('Decompilation timeout (60s)');
    }
    logger.error('sourceCode', '❌ Failed to decompile with SuiGPT', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Fetch source code using suigpt.tools (Step 1 + Step 2)
 */
async function fetchSourceCode(
  packageId: string,
  moduleName: string,
  network: Network
): Promise<string> {
  // Step 1: Get Base64 from Sui SDK
  const moduleBase64 = await getModuleBase64(packageId, moduleName, network);
  
  // Step 2: Decompile with suigpt.tools
  const sourceCode = await decompileWithSuiGPT(moduleBase64, network);
  
  return sourceCode;
}

/**
 * Parse source code to extract function information and calls
 */
function parseSourceCode(sourceCode: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = sourceCode.split('\n');
  
  // Debug: Show first 20 lines of source code
  logger.debug('sourceCode', `Parsing source code (${lines.length} lines, first 20):`, {
    preview: lines.slice(0, 20).join('\n'),
  });

  let currentFunction: Partial<FunctionInfo> | null = null;
  let inFunctionBody = false;
  let braceDepth = 0;
  let functionBody: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect function declaration
    // Patterns: "public entry fun", "entry public fun", "public fun", "public(friend) fun", "entry fun", "fun"
    // Capture all modifiers before "fun" and parse them
    const funcMatch = line.match(/^((?:public(?:\([^)]+\))?\s+|entry\s+)*)fun\s+(\w+)\s*\(/);
    
    if (funcMatch) {
      // Save previous function
      if (currentFunction && currentFunction.name) {
        // Parse calls from function body
        currentFunction.calls = extractCallsFromBody(functionBody);
        functions.push(currentFunction as FunctionInfo);
        logger.debug('sourceCode', `✅ Saved function: ${currentFunction.name}`);
      }

      // Start new function
      const modifiers = funcMatch[1] || ''; // "public entry ", "entry ", "public ", etc.
      const funcName = funcMatch[2];
      
      // Parse modifiers
      const isEntry = modifiers.includes('entry');
      const isPublic = modifiers.includes('public');
      const isFriend = modifiers.includes('public(friend)');
      
      logger.debug('sourceCode', `🔍 Found function declaration: ${funcName} (entry: ${isEntry}, public: ${isPublic}, friend: ${isFriend})`);

      let visibility = 'private';
      if (isEntry && isPublic) {
        visibility = 'entry'; // Entry functions are always implicitly public
      } else if (isEntry) {
        visibility = 'entry';
      } else if (isFriend) {
        visibility = 'public(friend)';
      } else if (isPublic) {
        visibility = 'public';
      }

      // Extract parameters
      const params = extractParameters(line);

      currentFunction = {
        name: funcName,
        visibility,
        params,
        calls: [],
      };

      functionBody = [line];
      inFunctionBody = false;
      braceDepth = 0;

      // Check if { is on the same line
      if (line.includes('{')) {
        inFunctionBody = true;
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      }

      continue;
    }

    // Track function body
    if (currentFunction) {
      functionBody.push(line);

      if (line.includes('{')) {
        if (!inFunctionBody) {
          inFunctionBody = true;
        }
        braceDepth += (line.match(/{/g) || []).length;
      }

      if (line.includes('}')) {
        braceDepth -= (line.match(/}/g) || []).length;
        if (braceDepth === 0 && inFunctionBody) {
          // Function ended
          currentFunction.calls = extractCallsFromBody(functionBody);
          functions.push(currentFunction as FunctionInfo);
          currentFunction = null;
          functionBody = [];
          inFunctionBody = false;
        }
      }
    }
  }

  // Handle last function if file ends without closing brace
  if (currentFunction && currentFunction.name) {
    currentFunction.calls = extractCallsFromBody(functionBody);
    functions.push(currentFunction as FunctionInfo);
    logger.debug('sourceCode', `✅ Saved function: ${currentFunction.name}`);
  }

  logger.debug('sourceCode', `Parsed ${functions.length} functions from decompiled code:`, {
    functions: functions.map(f => `${f.name} (${f.visibility}, ${f.calls.length} calls)`),
  });

  return functions;
}

/**
 * Extract parameters from function declaration
 */
function extractParameters(line: string): string[] {
  const params: string[] = [];
  
  // Extract everything between first ( and last )
  const paramsMatch = line.match(/\(([^)]*)\)/);
  if (paramsMatch && paramsMatch[1]) {
    const paramsStr = paramsMatch[1];
    // Split by comma, but be careful with nested generics
    const parts = paramsStr.split(',');
    parts.forEach(part => {
      const trimmed = part.trim();
      if (trimmed) {
        // Extract type (after the : )
        const typeMatch = trimmed.match(/:\s*(.+)$/);
        if (typeMatch) {
          params.push(typeMatch[1].trim());
        }
      }
    });
  }

  return params;
}

/**
 * Extract function calls from function body
 * Deduplicates calls, keeping the full version (with 0x address) when available
 */
function extractCallsFromBody(bodyLines: string[]): FunctionCall[] {
  // Map: module::func -> { module: full_module, func }
  const callMap = new Map<string, FunctionCall>();

  for (const line of bodyLines) {
    // First, match full package::module::function pattern
    const fullMatches = line.matchAll(/(0x[a-f0-9]+)::([a-z_][a-z0-9_]*)::([a-z_][a-z0-9_]*)\s*\(/gi);
    
    for (const match of fullMatches) {
      const pkg = match[1];
      const mod = match[2];
      const func = match[3];

      const fullModule = `${pkg}::${mod}`;
      const key = `${mod}::${func}`; // Use short form as key for deduplication

      // Always use full version (with 0x address)
      callMap.set(key, {
        module: fullModule,
        func,
      });
    }

    // Then, match short module::function pattern (only if not already found in full form)
    const shortMatches = line.matchAll(/([a-z_][a-z0-9_]*)::\s*([a-z_][a-z0-9_]*)\s*\(/gi);

    for (const match of shortMatches) {
      const mod = match[1];
      const func = match[2];
      const key = `${mod}::${func}`;

      // Only add if we don't already have the full version
      if (!callMap.has(key)) {
        callMap.set(key, {
          module: mod,
          func,
        });
      }
    }
  }

  return Array.from(callMap.values());
}

/**
 * Get or fetch module source code
 */
export async function getModuleSourceCode(
  packageId: string,
  moduleName: string,
  network: Network
): Promise<ModuleSourceCode> {
  // Check cache first
  const cached = await prisma.sourceCode.findUnique({
    where: {
      packageId_moduleName_network: {
        packageId,
        moduleName,
        network,
      },
    },
  });

  if (cached) {
    logger.debug('sourceCode', `Cache hit for ${packageId}::${moduleName}`);
    
    // Parse functions from JSON
    let functions: FunctionInfo[] = [];
    if (Array.isArray(cached.functions)) {
      functions = cached.functions as unknown as FunctionInfo[];
    }
    
    return {
      packageId: cached.packageId,
      moduleName: cached.moduleName,
      network: cached.network as Network,
      sourceCode: cached.sourceCode,
      functions,
    };
  }

  logger.info('sourceCode', `Fetching source code for ${packageId}::${moduleName} via suigpt.tools`);

  try {
    // Fetch source code using suigpt.tools (Sui SDK + decompiler API)
    const sourceCode = await fetchSourceCode(packageId, moduleName, network);

    // Parse source code
    const functions = parseSourceCode(sourceCode);

    // Cache in DB
    await prisma.sourceCode.create({
      data: {
        packageId,
        moduleName,
        network,
        sourceCode,
        functions: functions as any, // Prisma.JsonValue
      },
    });

    logger.info('sourceCode', `Cached decompiled source code for ${packageId}::${moduleName} (${functions.length} functions)`);

    return {
      packageId,
      moduleName,
      network,
      sourceCode,
      functions,
    };
  } catch (error: any) {
    logger.error('sourceCode', `Failed to get source code for ${packageId}::${moduleName}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Clear cache for a specific package
 */
export async function clearPackageCache(packageId: string): Promise<void> {
  await prisma.sourceCode.deleteMany({
    where: { packageId },
  });
  logger.info('sourceCode', `Cleared cache for package ${packageId}`);
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<void> {
  await prisma.sourceCode.deleteMany({});
  logger.info('sourceCode', 'Cleared all source code cache');
}

