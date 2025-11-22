/**
 * Explorer utility functions - generate URLs for blockchain explorers (Frontend)
 */

export type Network = 'mainnet' | 'testnet' | 'devnet';

export function suiscanPackageUrl(pkgId: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `${network}.suiscan.xyz`;
  return `https://${domain}/object/${pkgId}`;
}

export function suiscanModuleUrl(pkgId: string, module: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `${network}.suiscan.xyz`;
  return `https://${domain}/object/${pkgId}/contracts?module=${module}`;
}

export function suiexplorerPackageUrl(pkgId: string, network: Network = 'mainnet'): string {
  const networkParam = network === 'mainnet' ? '' : `?network=${network}`;
  return `https://suiexplorer.com/object/${pkgId}${networkParam}`;
}

export function suiexplorerModuleUrl(pkgId: string, module: string, network: Network = 'mainnet'): string {
  const networkParam = network === 'mainnet' ? '' : `?network=${network}`;
  return `https://suiexplorer.com/object/${pkgId}${networkParam}#${module}`;
}

export function suiscanObjectUrl(objectId: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `${network}.suiscan.xyz`;
  return `https://${domain}/object/${objectId}`;
}

export function suiexplorerObjectUrl(objectId: string, network: Network = 'mainnet'): string {
  const networkParam = network === 'mainnet' ? '' : `?network=${network}`;
  return `https://suiexplorer.com/object/${objectId}${networkParam}`;
}

export function suiscanTxUrl(txDigest: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `${network}.suiscan.xyz`;
  return `https://${domain}/tx/${txDigest}`;
}

export function suiexplorerTxUrl(txDigest: string, network: Network = 'mainnet'): string {
  const networkParam = network === 'mainnet' ? '' : `?network=${network}`;
  return `https://suiexplorer.com/txblock/${txDigest}${networkParam}`;
}

