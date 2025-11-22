import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { toast } from '@/hooks/use-toast';
import { 
  PACKAGE_ID, 
  SUBSCRIPTION_MODULE, 
  ANALYZER_MODULE, 
  SubscriptionTier,
  TIER_PRICES_MIST,
  TREASURY_ID 
} from '@/config/sui';

export function useSuiTransactions() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const client = useSuiClient();

  const subscribeTier = async (tier: SubscriptionTier) => {
    try {
      // Verify configuration
      if (!TREASURY_ID) {
        toast({
          title: 'Configuration Error',
          description: 'Treasury ID not configured. Please check src/config/sui.ts',
          variant: 'destructive',
        });
        throw new Error('Treasury ID not configured');
      }

      const tx = new Transaction();

      // Get the price for this tier
      const price = TIER_PRICES_MIST[tier];

      // Split coins from gas to pay for subscription
      // This creates a new Coin<SUI> with the exact amount needed
      const [paymentCoin] = tx.splitCoins(tx.gas, [price]);

      // Call the appropriate subscription function based on tier
      const tierNames = ['subscribe_basic', 'subscribe_pro', 'subscribe_elite'];
      const functionName = tierNames[tier];

      tx.moveCall({
        target: `${PACKAGE_ID}::${SUBSCRIPTION_MODULE}::${functionName}`,
        arguments: [
          paymentCoin,           // Coin<SUI> payment
          tx.object(TREASURY_ID), // Treasury shared object
        ],
      });

      toast({
        title: 'Transaction Submitted',
        description: 'Processing payment and creating subscription...',
      });

      const result = await signAndExecute({
        transaction: tx as any,
      });

      // Wait for transaction to be confirmed
      await client.waitForTransaction({
        digest: result.digest,
      });

      toast({
        title: 'Subscription Successful!',
        description: `Payment processed. You now have 1000 tokens!`,
      });

      return result;
    } catch (error) {
      console.error('Subscription error:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        if (error.message.includes('Insufficient')) {
          errorMessage = 'Insufficient SUI balance. Please add more SUI to your wallet.';
        } else if (error.message.includes('gas')) {
          errorMessage = 'Insufficient gas. Please add more SUI to your wallet.';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: 'Subscription Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const analyzeText = async (text: string, subscriptionNftId: string, depth: number = 1) => {
    try {
      const tx = new Transaction();

      // Validate depth (must be 1, 2, or 3)
      if (depth < 1 || depth > 3) {
        throw new Error('Depth must be between 1 and 3');
      }

      // Convert text to bytes
      const textBytes = Array.from(new TextEncoder().encode(text));

      // Call analyze_text which automatically uses the tier from the subscription NFT
      tx.moveCall({
        target: `${PACKAGE_ID}::${ANALYZER_MODULE}::analyze_text`,
        arguments: [
          tx.object(subscriptionNftId), // Pass the subscription NFT as reference
          tx.pure.vector('u8', textBytes), // Package ID as bytes
          tx.pure.u8(depth), // Depth of analysis (1-3)
        ],
      });

      toast({
        title: 'Analysis Submitted',
        description: 'Processing your text...',
      });

      const result = await signAndExecute({
        transaction: tx as any,
      });

      await client.waitForTransaction({
        digest: result.digest,
      });

      toast({
        title: 'Analysis Complete!',
        description: 'Your text has been analyzed and logged on-chain.',
      });

      return result;
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const upgradeSubscription = async (
    oldNftId: string, 
    currentTier: SubscriptionTier, 
    newTier: SubscriptionTier
  ) => {
    try {
      // Verify configuration
      if (!TREASURY_ID) {
        toast({
          title: 'Configuration Error',
          description: 'Treasury ID not configured.',
          variant: 'destructive',
        });
        throw new Error('Treasury ID not configured');
      }

      // Calculate price difference
      const oldPrice = TIER_PRICES_MIST[currentTier];
      const newPrice = TIER_PRICES_MIST[newTier];
      const priceDiff = newPrice - oldPrice;

      const tx = new Transaction();

      // Split coins for upgrade payment
      const [paymentCoin] = tx.splitCoins(tx.gas, [priceDiff]);

      // Call upgrade function
      tx.moveCall({
        target: `${PACKAGE_ID}::${SUBSCRIPTION_MODULE}::upgrade_subscription`,
        arguments: [
          tx.object(oldNftId),        // Old NFT (will be destroyed)
          tx.pure.u8(newTier),        // New tier
          paymentCoin,                // Payment (price difference)
          tx.object(TREASURY_ID),     // Treasury shared object
        ],
      });

      toast({
        title: 'Upgrade Submitted',
        description: 'Processing upgrade and preserving your tokens...',
      });

      const result = await signAndExecute({
        transaction: tx as any,
      });

      // Wait for transaction to be confirmed
      await client.waitForTransaction({
        digest: result.digest,
      });

      const tierNames = ['Basic', 'Pro', 'Elite'];
      toast({
        title: 'Upgrade Successful!',
        description: `Upgraded to ${tierNames[newTier]}! Your tokens have been preserved + 1000 bonus tokens added.`,
      });

      return result;
    } catch (error) {
      console.error('Upgrade error:', error);
      
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        if (error.message.includes('ECannotDowngrade')) {
          errorMessage = 'Cannot downgrade to a lower tier.';
        } else if (error.message.includes('ESameTier')) {
          errorMessage = 'You already have this tier.';
        } else if (error.message.includes('Insufficient')) {
          errorMessage = 'Insufficient SUI balance for upgrade.';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: 'Upgrade Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  };

  return {
    subscribeTier,
    upgradeSubscription,
    analyzeText,
    analyzePackage: analyzeText, // Alias for package analysis
  };
}
