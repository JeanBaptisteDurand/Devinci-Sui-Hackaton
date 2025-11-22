/**
 * Explorer utility functions - generate URLs for blockchain explorers
 */

export type Network = 'mainnet' | 'testnet' | 'devnet';

/**
 * Get SuiScan URLs
 */
export function suiscanPackageUrl(pkgId: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `${network}.suiscan.xyz`;
  return `https://${domain}/object/${pkgId}`;
}

export function suiscanModuleUrl(pkgId: string, module: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `${network}.suiscan.xyz`;
  return `https://${domain}/object/${pkgId}/contracts?module=${module}`;
}

export function suiscanObjectUrl(objectId: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `${network}.suiscan.xyz`;
  return `https://${domain}/object/${objectId}`;
}

export function suiscanTxUrl(txDigest: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `${network}.suiscan.xyz`;
  return `https://${domain}/tx/${txDigest}`;
}

/**
 * Get Sui Explorer URLs
 */
export function suiexplorerPackageUrl(pkgId: string, network: Network = 'mainnet'): string {
  const networkParam = network === 'mainnet' ? '' : `?network=${network}`;
  return `https://suiexplorer.com/object/${pkgId}${networkParam}`;
}

export function suiexplorerModuleUrl(pkgId: string, module: string, network: Network = 'mainnet'): string {
  const networkParam = network === 'mainnet' ? '' : `?network=${network}`;
  return `https://suiexplorer.com/object/${pkgId}${networkParam}#${module}`;
}

export function suiexplorerObjectUrl(objectId: string, network: Network = 'mainnet'): string {
  const networkParam = network === 'mainnet' ? '' : `?network=${network}`;
  return `https://suiexplorer.com/object/${objectId}${networkParam}`;
}

export function suiexplorerTxUrl(txDigest: string, network: Network = 'mainnet'): string {
  const networkParam = network === 'mainnet' ? '' : `?network=${network}`;
  return `https://suiexplorer.com/txblock/${txDigest}${networkParam}`;
}

/**
 * Get SuiVision URLs
 */
export function suivisionPackageUrl(pkgId: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suivision.xyz' : `${network}.suivision.xyz`;
  return `https://${domain}/package/${pkgId}`;
}

export function suivisionObjectUrl(objectId: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suivision.xyz' : `${network}.suivision.xyz`;
  return `https://${domain}/object/${objectId}`;
}

export function suivisionTxUrl(txDigest: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suivision.xyz' : `${network}.suivision.xyz`;
  return `https://${domain}/txblock/${txDigest}`;
}

/**
 * Generate all explorer links for a package
 */
export function getPackageExplorerLinks(pkgId: string, network: Network = 'mainnet') {
  return {
    suiscan: suiscanPackageUrl(pkgId, network),
    suiexplorer: suiexplorerPackageUrl(pkgId, network),
    suivision: suivisionPackageUrl(pkgId, network),
  };
}

/**
 * Generate all explorer links for a module
 */
export function getModuleExplorerLinks(pkgId: string, module: string, network: Network = 'mainnet') {
  return {
    suiscan: suiscanModuleUrl(pkgId, module, network),
    suiexplorer: suiexplorerModuleUrl(pkgId, module, network),
  };
}

/**
 * Generate all explorer links for an object
 */
export function getObjectExplorerLinks(objectId: string, network: Network = 'mainnet') {
  return {
    suiscan: suiscanObjectUrl(objectId, network),
    suiexplorer: suiexplorerObjectUrl(objectId, network),
    suivision: suivisionObjectUrl(objectId, network),
  };
}

/**
 * Generate all explorer links for a transaction
 */
export function getTxExplorerLinks(txDigest: string, network: Network = 'mainnet') {
  return {
    suiscan: suiscanTxUrl(txDigest, network),
    suiexplorer: suiexplorerTxUrl(txDigest, network),
    suivision: suivisionTxUrl(txDigest, network),
  };
}

