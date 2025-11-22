// ============================================================================
// SuiLens v2 - Comprehensive Graph Data Types
// ============================================================================

/**
 * Node ID types - tagged template literals for type safety
 */
export type NodeId =
  | `pkg:${string}`
  | `mod:${string}`
  | `type:${string}`
  | `obj:${string}`
  | `evt:${string}`
  | `addr:${string}`;

/**
 * Package node - represents a Sui Move package
 */
export interface PackageNode {
  id: `pkg:${string}`;
  address: string; // packageId (e.g., "0x002875...")
  version?: string;
  publisher?: string; // address that published the package
  publishedAt?: number; // timestamp
  explorerLinks?: {
    suiscan?: string;
    suiexplorer?: string;
    suivision?: string;
  };
  stats?: {
    modules: number;
    types: number;
    recentEvents: number;
  };
  displayName?: string; // human-readable name (fallback to address)
}

/**
 * Module constant - extracted from module definition
 */
export interface ModuleConstant {
  name: string;
  type: string;
  value: string | number | boolean;
}

/**
 * Module node - represents a Move module
 */
export interface ModuleNode {
  id: `mod:${string}`; // "mod:0xP::m"
  fullName: string; // "0xP::m"
  package: `pkg:${string}`; // parent package
  name: string; // simple module name
  functions: Array<{
    name: string;
    visibility: 'Entry' | 'Public' | 'Private' | 'Friend';
    isEntry?: boolean;
    parameters?: Array<{ name: string; type: string }>;
    returnType?: string;
  }>;
  typesDefined: string[]; // FQNs of types defined in this module
  friends: string[]; // FQNs of friend modules
  flags: string[]; // security/analysis flags
  constants?: ModuleConstant[]; // module-level constants
  explorerLinks?: {
    suiscan?: string;
    suiexplorer?: string;
  };
}

/**
 * Type node - represents a Move struct type
 */
export interface TypeNode {
  id: `type:${string}`; // "type:0xP::m::S"
  fqn: string; // "0xP::m::S"
  module: `mod:${string}`; // module that defines this type
  fields?: Array<{
    name: string;
    type: string; // type as string
  }>;
  hasKey: boolean; // struct has key ability (is an object type)
  abilities?: string[]; // copy, drop, store, key
}

/**
 * Object node - represents an on-chain object instance
 */
export interface ObjectNode {
  id: `obj:${string}`; // "obj:0xOBJECT_ID"
  objectId: string; // actual object ID
  typeFqn: string; // fully-qualified type name
  owner: {
    kind: 'AddressOwner' | 'Shared' | 'Immutable' | 'ObjectOwner';
    address?: string; // for AddressOwner/ObjectOwner
  };
  shared: boolean;
  snapshot?: Record<string, unknown>; // object fields snapshot
  version?: string;
  digest?: string;
}

/**
 * Address node - represents an address (EOA or object)
 */
export interface AddressNode {
  id: `addr:${string}`; // "addr:0xADDR"
  address: string;
  label?: string; // optional human-readable label
}

/**
 * Event node - represents an event (Publish, Upgrade, custom)
 */
export interface EventNode {
  id: `evt:${string}`; // "evt:TX_DIGEST:INDEX"
  kind: string; // "Publish" | "Upgrade" | "Mint" | custom
  pkg?: `pkg:${string}`; // associated package
  mod?: `mod:${string}`; // associated module
  ts?: number; // timestamp
  tx?: string; // transaction digest
  data?: Record<string, unknown>; // event data
  sender?: string; // event sender address
}

/**
 * Edge types - all possible relationships in the graph
 */
export type Edge =
  | {
    kind: 'PKG_CONTAINS';
    from: `pkg:${string}`;
    to: `mod:${string}`;
  }
  | {
    kind: 'PKG_DEPENDS';
    from: `pkg:${string}`;
    to: `pkg:${string}`;
    evidence: Array<{
      module: `mod:${string}`;
      function?: string;
      typeFqn?: string;
    }>;
  }
  | {
    kind: 'MOD_CALLS';
    from: `mod:${string}`;
    to: `mod:${string}`;
    callType?: 'friend' | 'samePackage' | 'external'; // relationship type
    calls: Array<{
      callerFunc: string;
      calleeModule?: string;
      calleeFunc?: string;
      viaType?: string;
      viaFunction?: string;
    }>;
  }
  | {
    kind: 'MOD_DEFINES_TYPE';
    from: `mod:${string}`;
    to: `type:${string}`;
  }
  | {
    kind: 'MOD_FRIEND_ALLOW';
    from: `mod:${string}`; // callee (grants access)
    to: `mod:${string}`; // caller (receives access)
  }
  | {
    kind: 'TYPE_USES_TYPE';
    from: `type:${string}`; // parent type
    to: `type:${string}`; // child type (used in field)
    fieldName?: string; // optional: which field uses this type
  }
  | {
    kind: 'OBJ_INSTANCE_OF';
    from: `obj:${string}`;
    to: `type:${string}`;
  }
  | {
    kind: 'OBJ_OWNED_BY';
    from: `obj:${string}`;
    to: `addr:${string}`;
  }
  | {
    kind: 'OBJ_REFERS_OBJ';
    from: `obj:${string}`;
    to: `obj:${string}`;
  }
  | {
    kind: 'OBJ_DF_CHILD';
    from: `obj:${string}`; // parent
    to: `obj:${string}`; // child (dynamic field)
  }
  | {
    kind: 'MOD_EMITS_EVENT';
    from: `mod:${string}`;
    to: `evt:${string}`;
  }
  | {
    kind: 'PKG_EMITS_EVENT';
    from: `pkg:${string}`;
    to: `evt:${string}`;
  };

/**
 * Analysis flag - security/analysis warning or info
 */
export interface Flag {
  level: 'LOW' | 'MED' | 'HIGH';
  kind: string; // e.g., "AdminCap", "HardcodedAddress", "UnsafeShared", "HardcodedFee", "HardcodedRole", "NonUpgradableThreshold"
  scope: 'package' | 'module' | 'type' | 'object' | 'function';
  refId: NodeId | string; // reference to the entity
  details?: Record<string, unknown>; // additional context (e.g., constName, value, location, bytecodeOffset)
}

/**
 * Type statistics - for large type sets
 */
export interface TypeStats {
  typeFqn: string;
  count?: number; // total instances
  uniqueOwners?: number;
  sampled?: number; // how many were sampled
  shared?: number; // how many are shared
}

/**
 * Complete graph data structure
 */
export interface GraphData {
  packages: PackageNode[];
  modules: ModuleNode[];
  types: TypeNode[];
  objects: ObjectNode[];
  addresses: AddressNode[];
  events: EventNode[];
  edges: Edge[];
  stats: {
    types: Record<string, TypeStats>;
    risk?: {
      modules?: Record<string, string[]>; // module FQN → flags
      objects?: Record<string, string[]>; // object ID → flags
    };
  };
  flags: Flag[];
}

/**
 * Network type
 */
export type Network = 'mainnet' | 'testnet' | 'devnet';

/**
 * Analysis configuration
 */
export interface AnalysisConfig {
  network?: Network; // which network to use (defaults to mainnet with testnet fallback)
  maxPkgDepth?: number; // how deep to recurse into dependencies
  maxObjDepth?: number; // how deep to follow object relationships (dynamic fields)
  
  // Object fetching thresholds
  typeCountThreshold?: number; // if count ≤ this, fetch all (default 100)
  objectSampleSize?: number; // how many objects to sample for large types (default 10)
  hardCapCritical?: number; // hard safety ceiling for critical types (default 5000)
  globalObjectNodeCap?: number; // UI safeguard: max object nodes to render (default 300)
  
  // Type classification
  sampleLargeTypes?: boolean; // whether to sample large type sets (default true)
  criticalTypes?: string[]; // types to always fetch fully (e.g., AdminCap, UpgradeCap, TreasuryCap)
  
  // Events
  eventsWindowDays?: number; // how many days of events to fetch
  eventPageSize?: number; // how many events per page (default 30)
}

/**
 * Job status for async analysis
 */
export interface JobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number; // 0-100
  analysisId?: string; // available when done
  network?: Network; // which network was used
  error?: string;
  createdAt: number;
  updatedAt: number;
}

