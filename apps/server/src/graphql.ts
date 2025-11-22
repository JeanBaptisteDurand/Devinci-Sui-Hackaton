import type { Network } from '@suilens/core';
import { logger } from './logger.js';

/**
 * GraphQL endpoints for Sui networks
 * NOTE: GraphQL is currently only available on mainnet
 * For testnet/devnet, we'll need to use RPC methods instead
 */
const GRAPHQL_ENDPOINTS: Record<Network, string> = {
  mainnet: 'https://sui-mainnet.mystenlabs.com/graphql',
  testnet: '', // GraphQL not available on testnet yet
  devnet: '', // GraphQL not available on devnet yet
};

/**
 * GraphQL object result
 */
export interface GraphQLObject {
  address: string;
  version: number;
  digest: string;
  owner: {
    __typename: string;
    owner?: { address: string };
    initialSharedVersion?: number;
  };
  asMoveObject?: {
    contents: {
      type: { repr: string };
      json: any;
    };
  };
}

export interface GraphQLObjectsResponse {
  data: {
    objects: {
      nodes: GraphQLObject[];
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
}

/**
 * Query objects by StructType using GraphQL
 */
export async function queryObjectsByType(params: {
  network: Network;
  structType: string;
  limit?: number;
  cursor?: string;
}): Promise<{
  objects: GraphQLObject[];
  hasNextPage: boolean;
  nextCursor: string | null;
}> {
  const { network, structType, limit = 50, cursor } = params;
  const endpoint = GRAPHQL_ENDPOINTS[network];

  // GraphQL is only available on mainnet currently
  if (!endpoint || network !== 'mainnet') {
    logger.warn('graphql', `GraphQL not available for ${network}, returning empty result`);
    return {
      objects: [],
      hasNextPage: false,
      nextCursor: null,
    };
  }

  // Build pagination parameters
  const paginationParams = cursor
    ? `after: "${cursor}", first: ${limit}`
    : `first: ${limit}`;

  // GraphQL query
  const query = `
    query {
      objects(
        filter: { type: "${structType}" }
        ${paginationParams}
      ) {
        nodes {
          address
          version
          digest
          owner {
            __typename
            ... on AddressOwner {
              owner {
                address
              }
            }
            ... on Shared {
              initialSharedVersion
            }
          }
          asMoveObject {
            contents {
              type {
                repr
              }
              json
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  try {
    logger.debug('graphql', `Querying objects for type: ${structType}`, {
      limit,
      cursor: cursor ? `${cursor.slice(0, 20)}...` : 'none',
    });

    // Create abort controller for timeout (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as GraphQLObjectsResponse;

      if (!result.data?.objects) {
        logger.error('graphql', 'Invalid GraphQL response', result);
        throw new Error('Invalid GraphQL response: missing data.objects');
      }

      const objects = result.data.objects.nodes || [];
      const pageInfo = result.data.objects.pageInfo;

      logger.info('graphql', `Found ${objects.length} objects for type ${structType}`, {
        hasNextPage: pageInfo?.hasNextPage || false,
        totalFetched: objects.length,
      });

      return {
        objects,
        hasNextPage: pageInfo?.hasNextPage || false,
        nextCursor: pageInfo?.endCursor || null,
      };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        logger.error('graphql', `Query timeout (30s) for type: ${structType}`);
        throw new Error(`GraphQL query timeout after 30 seconds`);
      }
      throw fetchError;
    }
  } catch (error: any) {
    logger.error('graphql', `Failed to query objects by type: ${structType}`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Estimate total object count for a type (fetches first page only)
 */
export async function estimateObjectCount(params: {
  network: Network;
  structType: string;
}): Promise<{ estimatedCount: number; hasMore: boolean }> {
  const { network, structType } = params;

  try {
    const result = await queryObjectsByType({
      network,
      structType,
      limit: 50,
    });

    return {
      estimatedCount: result.objects.length,
      hasMore: result.hasNextPage,
    };
  } catch (error: any) {
    logger.warn('graphql', `Failed to estimate count for ${structType}: ${error.message}`);
    return { estimatedCount: 0, hasMore: false };
  }
}

