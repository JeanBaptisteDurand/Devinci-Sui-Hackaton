// ===== Sui Network Configuration =====

// Network selection (testnet | mainnet | devnet)
export const NETWORK = 'testnet';

// ===== Package Configuration =====
// ⚠️ IMPORTANT: Update this after every deployment
// This is the deployed package address on Sui blockchain
// Get this from: sui client publish --gas-budget 100000000
export const PACKAGE_ID = '0xa5b256d451691f7ac3d348efb24fe30bc9a67214c92fab9374f3b8a2eddc6925';

// Treasury ID (shared object created during package deployment)
// Get this from the deployment output or query: sui client objects --address DEPLOYER_ADDRESS
// Look for object of type: PACKAGE_ID::subscription::Treasury
export const TREASURY_ID = '0x1eec2d7af8f7ec796cb96d51daaceb34178705305d1f02e56220291386d660b8';

// ===== Module Names =====
export const SUBSCRIPTION_MODULE = 'subscription';
export const ANALYZER_MODULE = 'analyzer';

// ===== Subscription Tiers =====
export enum SubscriptionTier {
  BASIC = 0,
  PRO = 1,
  ELITE = 2,
}

export const TIER_NAMES = {
  [SubscriptionTier.BASIC]: 'Basic',
  [SubscriptionTier.PRO]: 'Pro',
  [SubscriptionTier.ELITE]: 'Elite',
};

export const TIER_DESCRIPTIONS = {
  [SubscriptionTier.BASIC]: 'Perfect for getting started with basic text analysis',
  [SubscriptionTier.PRO]: 'Advanced features for professional use',
  [SubscriptionTier.ELITE]: 'Premium tier with unlimited access',
};

// ===== Pricing Configuration =====
// Prices in MIST (1 SUI = 1,000,000,000 MIST)
// These MUST match the prices in move/sources/subscription.move
export const TIER_PRICES_MIST = {
  [SubscriptionTier.BASIC]: 100_000_000,    // 0.1 SUI
  [SubscriptionTier.PRO]: 500_000_000,      // 0.5 SUI
  [SubscriptionTier.ELITE]: 1_000_000_000,  // 1.0 SUI
};

// Human-readable prices for display
export const TIER_PRICES = {
  [SubscriptionTier.BASIC]: '0.1 SUI',
  [SubscriptionTier.PRO]: '0.5 SUI',
  [SubscriptionTier.ELITE]: '1.0 SUI',
};

// ===== Configuration Validation =====
export const isConfigured = (): boolean => {
  // Check if treasury is configured (package ID is already set from previous deployment)
  return TREASURY_ID.length > 0;
};

export const getConfigurationStatus = (): {
  packageId: boolean;
  treasuryId: boolean;
  message: string;
} => {
  const packageConfigured = PACKAGE_ID.length > 0;
  const treasuryConfigured = TREASURY_ID.length > 0;
  
  let message = '';
  if (!packageConfigured) {
    message = 'Package ID not configured. Deploy the Move package first.';
  } else if (!treasuryConfigured) {
    message = 'Treasury ID not configured. Check deployment output for Treasury address.';
  } else {
    message = 'Configuration complete!';
  }
  
  return {
    packageId: packageConfigured,
    treasuryId: treasuryConfigured,
    message,
  };
};
