import type { ModuleConstant } from '@suilens/core';
import { logger } from './logger.js';

/**
 * Extract module-level constants from normalized module data
 * This works with the Sui normalized API data, not disassembled bytecode
 */
export function extractModuleConstants(moduleData: any): ModuleConstant[] {
  const constants: ModuleConstant[] = [];

  try {
    // Extract from struct fields that look like constants
    if (moduleData.structs) {
      for (const [structName, structData] of Object.entries(moduleData.structs)) {
        const struct = structData as any;
        
        // Look for constant-like patterns in struct names
        if (structName.toUpperCase() === structName || structName.includes('CONST')) {
          if (struct.fields && Array.isArray(struct.fields)) {
            struct.fields.forEach((field: any) => {
              constants.push({
                name: `${structName}::${field.name || 'value'}`,
                type: typeof field.type === 'string' ? field.type : JSON.stringify(field.type),
                value: field.name || structName,
              });
            });
          }
        }
      }
    }

    // Extract from exposed functions that return constants
    if (moduleData.exposedFunctions) {
      for (const [funcName, funcData] of Object.entries(moduleData.exposedFunctions)) {
        const func = funcData as any;
        
        // Functions with names like get_*, constant_*, or all uppercase might return constants
        if (
          funcName.startsWith('get_') ||
          funcName.startsWith('constant_') ||
          funcName.toUpperCase() === funcName
        ) {
          if (func.return && func.return.length > 0) {
            const returnType = typeof func.return[0] === 'string' 
              ? func.return[0] 
              : JSON.stringify(func.return[0]);
            
            constants.push({
              name: funcName,
              type: returnType,
              value: `<from function ${funcName}>`,
            });
          }
        }
      }
    }
  } catch (error: any) {
    logger.warn('moduleAnalysis', `Failed to extract constants: ${error.message}`);
  }

  return constants;
}

/**
 * Detect hardcoded values and emit security flags
 * This works with extracted constants from normalized data
 */
export function detectHardcodedFlags(
  moduleId: string,
  constants: ModuleConstant[],
  _functions?: any // Unused, kept for compatibility
): Array<{
  level: 'LOW' | 'MED' | 'HIGH';
  kind: string;
  scope: 'module' | 'function';
  refId: string;
  details: Record<string, unknown>;
}> {
  const flags: Array<{
    level: 'LOW' | 'MED' | 'HIGH';
    kind: string;
    scope: 'module' | 'function';
    refId: string;
    details: Record<string, unknown>;
  }> = [];

  // Check module-level constants
  constants.forEach((constant) => {
    // Check for hardcoded addresses
    if (constant.type.includes('address') || constant.type.includes('Address')) {
      const address = constant.value.toString();
      
      // Flag non-system addresses (0x0, 0x1, 0x2 are system addresses)
      if (
        address.startsWith('0x') &&
        address !== '0x0' &&
        address !== '0x1' &&
        address !== '0x2'
      ) {
        flags.push({
          level: 'MED',
          kind: 'HardcodedAddress',
          scope: 'module',
          refId: moduleId,
          details: {
            constName: constant.name,
            value: constant.value,
            message: 'Hardcoded address detected - potential centralization risk',
          },
        });
      }
    }

    // Check for hardcoded fees/amounts
    if (
      (constant.type === 'u64' || constant.type === 'u128' || constant.type === 'U64' || constant.type === 'U128') &&
      (constant.name.toLowerCase().includes('fee') ||
        constant.name.toLowerCase().includes('amount') ||
        constant.name.toLowerCase().includes('price'))
    ) {
      flags.push({
        level: 'LOW',
        kind: 'HardcodedFee',
        scope: 'module',
        refId: moduleId,
        details: {
          constName: constant.name,
          value: constant.value,
          message: 'Hardcoded fee or amount - consider making it configurable',
        },
      });
    }

    // Check for hardcoded roles
    if (
      constant.name.toLowerCase().includes('role') ||
      constant.name.toLowerCase().includes('admin') ||
      constant.name.toLowerCase().includes('owner')
    ) {
      flags.push({
        level: 'MED',
        kind: 'HardcodedRole',
        scope: 'module',
        refId: moduleId,
        details: {
          constName: constant.name,
          value: constant.value,
          message: 'Hardcoded role detected - verify access control',
        },
      });
    }
  });

  return flags;
}

