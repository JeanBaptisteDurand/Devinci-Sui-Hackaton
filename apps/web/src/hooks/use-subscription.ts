import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { SubscriptionTier, PACKAGE_ID } from '@/config/sui';

export interface SubscriptionNFT {
  id: string;
  tier: SubscriptionTier;
  owner: string;
  tokenBalance: number;
}

export function useSubscription() {
  const account = useCurrentAccount();
  const client = useSuiClient();

  const { data: subscription, isLoading, refetch } = useQuery({
    queryKey: ['subscription', account?.address],
    queryFn: async () => {
      if (!account?.address) return null;

      try {
        // Query owned objects for subscription NFTs
        const objects = await client.getOwnedObjects({
          owner: account.address,
          filter: {
            StructType: `${PACKAGE_ID}::subscription::SubscriptionNFT`
          },
          options: {
            showContent: true,
            showType: true,
          },
        });

        if (objects.data.length === 0) return null;

        // Get the first subscription NFT (users typically have one per tier)
        const nft = objects.data[0];
        
        if (!nft.data) return null;

        const content = nft.data.content;

        // Parse the NFT content based on the Move structure
        if (content && content.dataType === 'moveObject' && 'fields' in content) {
          const fields = content.fields as any;
          
          return {
            id: nft.data.objectId,
            tier: parseInt(fields.tier) as SubscriptionTier,
            owner: fields.owner,
            tokenBalance: parseInt(fields.token_balance) || 0,
          } as SubscriptionNFT;
        }

        return null;
      } catch (error) {
        console.error('Error fetching subscription:', error);
        // Return null instead of throwing to prevent breaking the UI
        return null;
      }
    },
    enabled: !!account?.address && PACKAGE_ID.length > 0,
    refetchInterval: 10000, // Refetch every 10 seconds
    retry: 1, // Only retry once on failure
  });

  return {
    subscription,
    isLoading,
    refetch,
    hasSubscription: !!subscription,
    tier: subscription?.tier,
    tokenBalance: subscription?.tokenBalance || 0,
    hasTokens: (subscription?.tokenBalance || 0) >= 5,
  };
}
