/**
 * Explorer utility functions - generate URLs for blockchain explorers (Frontend)
 */

export type Network = 'mainnet' | 'testnet' | 'devnet';

export function suiscanPackageUrl(pkgId: string, network: Network = 'mainnet'): string {
  if (pkgId.startsWith('pkg:')) {
    pkgId = pkgId.slice(4);
  }
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `suiscan.xyz/${network}`;
  return `https://${domain}/object/${pkgId}`;
}

export function suiscanModuleUrl(pkgId: string, module: string, network: Network = 'mainnet'): string {
  if (pkgId.startsWith('pkg:')) {
    pkgId = pkgId.slice(4);
  }
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `suiscan.xyz/${network}`;
  return `https://${domain}/object/${pkgId}/contracts?module=${module}`;
}

export function suivisionPackageUrl(pkgId: string, network: Network = 'mainnet'): string {
    if (pkgId.startsWith('pkg:')) {
    pkgId = pkgId.slice(4);
  } 
  const domain = network === 'mainnet' ? 'suivision.xyz' : `${network}.suivision.xyz`;
  return `https://${domain}/object/${pkgId}`;
}

export function suivisionModuleUrl(pkgId: string, module: string, network: Network = 'mainnet'): string {
    if (pkgId.startsWith('pkg:')) {
    pkgId = pkgId.slice(4);
  }
  const domain = network === 'mainnet' ? 'suivision.xyz' : `${network}.suivision.xyz`;
  return `https://${domain}/object/${pkgId}#${module}`;
}

export function suiscanObjectUrl(objectId: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `suiscan.xyz/${network}`;
  return `https://${domain}/object/${objectId}`;
}

export function suivisionObjectUrl(objectId: string, network: Network = 'mainnet'): string {
   const domain = network === 'mainnet' ? 'suivision.xyz' : `${network}.suivision.xyz`;
  return `https://${domain}/object/${objectId}`;
}

export function suiscanTxUrl(txDigest: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suiscan.xyz' : `suiscan.xyz/${network}`;
  return `https://${domain}/tx/${txDigest}`;
}

export function suivisionTxUrl(txDigest: string, network: Network = 'mainnet'): string {
  const domain = network === 'mainnet' ? 'suivision.xyz' : `${network}.suivision.xyz`;
  return `https://${domain}/txblock/${txDigest}`;
}

