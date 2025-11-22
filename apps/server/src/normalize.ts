/**
 * Recursively extracts fully-qualified types from Sui Move type definitions
 */

export function extractFullyQualifiedTypes(type: any): string[] {
    const types: Set<string> = new Set();
  
    function walkType(t: any): void {
      if (!t) return;
  
      // Handle string types (fully-qualified)
      if (typeof t === 'string') {
        if (t.includes('::')) {
          types.add(t);
        }
        return;
      }
  
      // Handle Struct type
      if (t.Struct) {
        const struct = t.Struct;
        if (struct.address && struct.module && struct.name) {
          const fqType = `${struct.address}::${struct.module}::${struct.name}`;
          types.add(fqType);
        }
        // Walk type parameters
        if (struct.typeArguments) {
          struct.typeArguments.forEach((arg: any) => walkType(arg));
        }
        return;
      }
  
      // Handle Reference type
      if (t.Reference) {
        walkType(t.Reference);
        return;
      }
  
      // Handle MutableReference type
      if (t.MutableReference) {
        walkType(t.MutableReference);
        return;
      }
  
      // Handle Vector type
      if (t.Vector) {
        walkType(t.Vector);
        return;
      }
  
      // Handle TypeParameter
      if (t.TypeParameter) {
        // Type parameters don't contribute to dependencies
        return;
      }
  
      // Handle object
      if (typeof t === 'object') {
        Object.values(t).forEach((value) => walkType(value));
      }
    }
  
    walkType(type);
    return Array.from(types);
  }
  
  /**
   * Extract package address from a fully-qualified type string
   */
  export function extractPackageAddress(fqType: string): string | null {
    const match = fqType.match(/^(0x[a-fA-F0-9]+)::/);
    return match ? match[1] : null;
  }
  
  /**
   * Extract module name from a fully-qualified type string
   */
  export function extractModuleName(fqType: string): string | null {
    const match = fqType.match(/^0x[a-fA-F0-9]+::([^:]+)::/);
    return match ? match[1] : null;
  }
  