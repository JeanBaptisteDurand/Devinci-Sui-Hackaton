import { useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useZkLogin } from '@/hooks/use-zklogin';
import { 
  PACKAGE_ID, 
  ANALYZER_MODULE, 
} from '@/config/sui';

/**
 * Hook for zkLogin users to execute sponsored transactions
 */
export function useSponsoredTransactions() {
  const client = useSuiClient();
  const { user, getAuthHeaders } = useAuth();
  const zkLogin = useZkLogin();

  /**
   * Analyze text with a sponsored transaction (for zkLogin users)
   */
  const analyzeTextSponsored = async (
    text: string, 
    subscriptionNftId: string, 
    depth: number = 1
  ) => {
    try {
      // Verify user is logged in with zkLogin
      if (user?.authProvider !== 'zklogin') {
        throw new Error('Sponsored transactions are only available for zkLogin users');
      }

      if (!zkLogin.zkProof || !zkLogin.address) {
        throw new Error('zkLogin session not available');
      }

      // Validate depth
      if (depth < 1 || depth > 3) {
        throw new Error('Depth must be between 1 and 3');
      }

      // Build the transaction
      const tx = new Transaction();
      tx.setSender(zkLogin.address);

      // Convert text to bytes
      const textBytes = Array.from(new TextEncoder().encode(text));

      // Call analyze_text
      tx.moveCall({
        target: `${PACKAGE_ID}::${ANALYZER_MODULE}::analyze_text`,
        arguments: [
          tx.object(subscriptionNftId),
          tx.pure.vector('u8', textBytes),
          tx.pure.u8(depth),
        ],
      });

      toast({
        title: 'Preparing Transaction',
        description: 'Building sponsored transaction...',
      });

      // Build the transaction bytes
      const txBytes = await tx.build({ client });

      // Sign the transaction with zkLogin
      const signResult = await zkLogin.signTransaction(txBytes);
      if (!signResult) {
        throw new Error('Failed to sign transaction');
      }

      toast({
        title: 'Submitting Transaction',
        description: 'Sending sponsored transaction to backend...',
      });

      // Submit the sponsored transaction to backend
      const response = await fetch('/api/tx/submit-sponsored', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          txBytes: Buffer.from(txBytes).toString('base64'),
          signature: signResult.signature,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit sponsored transaction');
      }

      const result = await response.json();

      // Wait for transaction confirmation
      await client.waitForTransaction({
        digest: result.digest,
      });

      toast({
        title: 'Analysis Complete!',
        description: 'Your text has been analyzed (gas sponsored).',
      });

      return { digest: result.digest };
    } catch (error) {
      console.error('Sponsored transaction error:', error);
      toast({
        title: 'Sponsored Transaction Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return {
    analyzeTextSponsored,
  };
}

