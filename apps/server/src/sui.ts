import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

export type Network = 'mainnet' | 'testnet' | 'devnet';

// Create clients for each network
const clients = new Map<Network, SuiClient>();

/**
 * Get or create a SuiClient for the specified network
 */
export function getSuiClient(network: Network = 'mainnet'): SuiClient {
    if (!clients.has(network)) {
        const url = process.env[`SUI_RPC_URL_${network.toUpperCase()}`] || getFullnodeUrl(network);
        clients.set(network, new SuiClient({ url }));
    }
    return clients.get(network)!;
}

// Default mainnet client for backward compatibility
export const suiClient = getSuiClient('mainnet');

