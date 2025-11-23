import { useState, useCallback, useEffect } from 'react';
import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { toast } from '@/hooks/use-toast';

const AUTH_MESSAGE = 'Sign this message to authenticate with SuiLens';

interface AuthState {
  token: string | null;
  user: { 
    id: string; 
    walletAddress: string; 
    authProvider?: 'slush' | 'zklogin' 
  } | null;
  isLoading: boolean;
}

export function useAuth() {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const [authState, setAuthState] = useState<AuthState>({
    token: localStorage.getItem('auth_token'),
    user: JSON.parse(localStorage.getItem('auth_user') || 'null'),
    isLoading: false,
  });

  // Only invalidate JWT if wallet address changes (for security)
  // JWT persists independently of wallet connection state
  useEffect(() => {
    const storedUserStr = localStorage.getItem('auth_user');
    const storedUser = storedUserStr ? JSON.parse(storedUserStr) : null;
    
    // Only clear token if wallet address changed (user switched wallets)
    // Don't clear token when wallet disconnects - JWT can live longer
    if (account?.address && storedUser && storedUser.walletAddress !== account.address) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      setAuthState({
        token: null,
        user: null,
        isLoading: false,
      });
    }
  }, [account?.address]);

  const login = useCallback(async () => {
    if (!account?.address) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet first.',
        variant: 'destructive',
      });
      return false;
    }

    setAuthState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Sign the message
      const messageBytes = new TextEncoder().encode(AUTH_MESSAGE);
      const result = await signPersonalMessage({
        message: messageBytes,
      });

      // Send to backend for verification and JWT generation
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: account.address,
          message: AUTH_MESSAGE,
          signature: result.signature,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Authentication failed');
      }

      const data = await response.json();

      // Store token and user info
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      setAuthState({
        token: data.token,
        user: data.user,
        isLoading: false,
      });

      toast({
        title: 'Authentication Successful',
        description: 'You are now authenticated.',
      });

      return true;
    } catch (error: any) {
      console.error('Authentication error:', error);
      toast({
        title: 'Authentication Failed',
        description: error.message || 'Failed to authenticate',
        variant: 'destructive',
      });
      setAuthState((prev) => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [account?.address, signPersonalMessage]);

  const logout = useCallback(async () => {
    try {
      // Call backend logout endpoint
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authState.token ? { Authorization: `Bearer ${authState.token}` } : {}),
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state regardless of backend response
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      setAuthState({
        token: null,
        user: null,
        isLoading: false,
      });
      
      toast({
        title: 'Logged Out',
        description: 'You have been logged out successfully.',
      });
    }
  }, [authState.token]);

  /**
   * Login with zkLogin via Enoki
   */
  const loginWithZkLogin = useCallback(async (sessionToken: string, address: string) => {
    setAuthState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Send zkLogin sessionToken and address to backend for verification and JWT generation
      const response = await fetch('/api/auth/zklogin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionToken,
          address,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'zkLogin authentication failed');
      }

      const data = await response.json();

      // Store token and user info
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      setAuthState({
        token: data.token,
        user: data.user,
        isLoading: false,
      });

      toast({
        title: 'Authentication Successful',
        description: 'You are now authenticated with zkLogin.',
      });

      return true;
    } catch (error: any) {
      console.error('zkLogin authentication error:', error);
      toast({
        title: 'zkLogin Failed',
        description: error.message || 'Failed to authenticate with zkLogin',
        variant: 'destructive',
      });
      setAuthState((prev) => ({ ...prev, isLoading: false }));
      return false;
    }
  }, []);

  const getAuthHeaders = useCallback(() => {
    if (!authState.token) {
      return {};
    }
    return {
      Authorization: `Bearer ${authState.token}`,
    };
  }, [authState.token]);

  // Auto-login when wallet is connected and no token exists
  const ensureAuthenticated = useCallback(async () => {
    if (account?.address && !authState.token && !authState.isLoading) {
      return await login();
    }
    return !!authState.token;
  }, [account?.address, authState.token, authState.isLoading, login]);

  return {
    ...authState,
    login,
    loginWithZkLogin,
    logout,
    getAuthHeaders,
    ensureAuthenticated,
    isAuthenticated: !!authState.token,
  };
}

