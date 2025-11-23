import { useState, useCallback, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

const ENOKI_PUBLIC_KEY = import.meta.env.VITE_ENOKI_PUBLIC_KEY || 'enoki_public_c3fe41d6ea28023237de44114c4411af';

interface ZkLoginState {
  isInitializing: boolean;
  isAuthenticated: boolean;
  address: string | null;
  zkProof: string | null;
}

/**
 * Simplified zkLogin hook that delegates OAuth and zkProof handling to the backend
 * This avoids issues with Enoki SDK in the browser
 */
export function useZkLogin() {
  const [state, setState] = useState<ZkLoginState>({
    isInitializing: false,
    isAuthenticated: false,
    address: null,
    zkProof: null,
  });

  // Check if we're returning from OAuth redirect
  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Check if we have zkLogin data in URL (from backend redirect)
      const urlParams = new URLSearchParams(window.location.search);
      const zkProofParam = urlParams.get('zkProof');
      const addressParam = urlParams.get('address');

      if (zkProofParam && addressParam) {
        setState({
          isInitializing: false,
          isAuthenticated: true,
          address: addressParam,
          zkProof: zkProofParam,
        });

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    handleOAuthCallback();
  }, []);

  /**
   * Initiate zkLogin flow with Google
   * This redirects to backend which handles Enoki OAuth
   */
  const loginWithGoogle = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isInitializing: true }));

      // Redirect to backend zkLogin initiation endpoint
      // The backend will handle Enoki OAuth and redirect back
      const redirectUrl = encodeURIComponent(window.location.origin + window.location.pathname);
      window.location.href = `/api/auth/zklogin/initiate?redirect=${redirectUrl}`;
    } catch (error: any) {
      console.error('zkLogin initiation error:', error);
      toast({
        title: 'zkLogin Failed',
        description: error.message || 'Failed to initiate zkLogin',
        variant: 'destructive',
      });
      setState((prev) => ({ ...prev, isInitializing: false }));
    }
  }, []);

  /**
   * Sign a transaction
   * For simplicity, we'll send the transaction to backend for signing
   */
  const signTransaction = useCallback(
    async (txBytes: Uint8Array): Promise<{ signature: string } | null> => {
      if (!state.zkProof) {
        console.error('No zkProof available');
        return null;
      }

      try {
        // Send to backend for signing
        const response = await fetch('/api/tx/sign-zklogin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            txBytes: Buffer.from(txBytes).toString('base64'),
            zkProof: state.zkProof,
            address: state.address,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to sign transaction');
        }

        const result = await response.json();
        return { signature: result.signature };
      } catch (error: any) {
        console.error('Transaction signing error:', error);
        toast({
          title: 'Signing Failed',
          description: error.message || 'Failed to sign transaction',
          variant: 'destructive',
        });
        return null;
      }
    },
    [state.zkProof, state.address]
  );

  return {
    ...state,
    loginWithGoogle,
    signTransaction,
  };
}

