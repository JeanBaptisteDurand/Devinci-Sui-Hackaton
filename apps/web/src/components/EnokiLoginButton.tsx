import {
  useCurrentAccount,
  useConnectWallet,
  useWallets,
  useDisconnectWallet,
} from '@mysten/dapp-kit';
import { EnokiClient } from '@mysten/enoki';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState } from 'react';

// Helper to identify Enoki wallets (they have specific name patterns)
const isEnokiWallet = (wallet: any): boolean => {
  const name = wallet.name?.toLowerCase() || '';
  return name.includes('enoki') || name.includes('google') || name.includes('zklogin');
};

export function EnokiLoginButton() {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: connectWallet } = useConnectWallet();
  const { mutateAsync: disconnectWallet } = useDisconnectWallet();
  const wallets = useWallets();
  const { user, loginWithZkLogin, logout } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);

  // Enoki client for frontend (using public key)
  const enokiClient = new EnokiClient({
    apiKey: import.meta.env.VITE_ENOKI_PUBLIC_KEY || 'enoki_public_c3fe41d6ea28023237de44114c4411af',
  });

  // Auto-authenticate after Enoki wallet connection
  useEffect(() => {
    const handleEnokiAuth = async () => {
      if (!currentAccount || isConnecting || user?.authProvider === 'zklogin') {
        return;
      }

      // Check if connected to an Enoki wallet
      const enokiWallets = wallets.filter(isEnokiWallet);
      const isEnokiConnected = enokiWallets.some(wallet => 
        wallet.accounts?.some((acc: any) => acc.address === currentAccount.address)
      );

      if (isEnokiConnected && currentAccount.address) {
        try {
          setIsConnecting(true);
          
          // Try to get sessionToken from Enoki
          // After OAuth callback, the session should be available
          let sessionToken = '';
          
          // Try multiple methods to get the sessionToken
          const googleWallet = enokiWallets.find(w => 
            w.name?.toLowerCase().includes('google') || 
            w.name?.toLowerCase().includes('enoki')
          );
          
          if (googleWallet) {
            // Method 1: Try wallet features
            if (googleWallet.features?.['enoki:session']) {
              sessionToken = googleWallet.features['enoki:session'].getSessionToken?.() || '';
            }
            
            // Method 2: Try direct method on wallet
            if (!sessionToken && googleWallet.getSessionToken) {
              sessionToken = googleWallet.getSessionToken() || '';
            }
            
            // Method 3: Try to get from account
            if (!sessionToken && currentAccount) {
              const account = googleWallet.accounts?.find((acc: any) => acc.address === currentAccount.address);
              if (account?.sessionToken) {
                sessionToken = account.sessionToken;
              }
            }
          }

          // Method 4: Try accessing session from wallet's internal state
          if (!sessionToken && googleWallet) {
            // Enoki wallets might store session in different places
            // Check wallet's internal state or connected account
            try {
              const connectedAccount = googleWallet.accounts?.find(
                (acc: any) => acc.address === currentAccount.address
              );
              if (connectedAccount) {
                // Check various possible locations for sessionToken
                sessionToken = connectedAccount.sessionToken || 
                              connectedAccount.session?.token ||
                              (connectedAccount as any).enokiSessionToken || '';
              }
            } catch (e) {
              console.debug('Could not get session from account:', e);
            }
          }

          // If we have both address and sessionToken, authenticate
          if (sessionToken && currentAccount.address) {
            await loginWithZkLogin(sessionToken, currentAccount.address);
          } else {
            console.warn('Could not retrieve sessionToken for Enoki wallet');
          }
        } catch (error) {
          console.error('Auto-auth with Enoki failed:', error);
        } finally {
          setIsConnecting(false);
        }
      }
    };

    handleEnokiAuth();
  }, [currentAccount, wallets, user, isConnecting, loginWithZkLogin]);

  const isConnectedViaGoogleZkLogin = () => {
    if (!currentAccount) return false;
    
    // Check if user is authenticated with zkLogin via JWT
    if (user?.authProvider === 'zklogin') {
      return true;
    }

    // Also check if connected to an Enoki wallet
    const enokiWallets = wallets.filter(isEnokiWallet);
    const googleWallet = enokiWallets.find(
      (wallet: any) =>
        wallet.name?.toLowerCase().includes('google') || 
        wallet.name?.toLowerCase().includes('enoki'),
    );

    return !!googleWallet && currentAccount.address !== undefined;
  };

  const handleGoogleLogin = async () => {
    try {
      // Check if already logged in with Slush
      if (user?.authProvider === 'slush') {
        alert('Please logout from Slush wallet first before using zkLogin.');
        return;
      }

      setIsConnecting(true);

      // Disconnect any existing wallet
      if (currentAccount) {
        await disconnectWallet();
        console.log('Disconnected existing wallet');
        // Wait for disconnect to complete
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Find the Enoki Google wallet
      const enokiWallets = wallets.filter(isEnokiWallet);
      const googleWallet = enokiWallets.find(
        (wallet: any) =>
          wallet.name?.toLowerCase().includes('google') || 
          wallet.name?.toLowerCase().includes('enoki'),
      );

      if (!googleWallet) {
        console.error('Google zkLogin wallet not found');
        alert(
          'Google zkLogin wallet not found. Make sure Enoki is configured properly.',
        );
        setIsConnecting(false);
        return;
      }

      // Connect to Google zkLogin wallet
      // This will trigger Google OAuth flow if not already authenticated
      await connectWallet({ wallet: googleWallet });
      
      // The useEffect hook will handle authentication after connection
      // We just need to wait a bit for the connection to complete
      console.log('Connected to Google zkLogin wallet');
    } catch (error) {
      console.error('Google zkLogin failed:', error);
      alert('Login failed: ' + (error as Error).message);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectWallet();
      await logout(); // Also logout from backend
      console.log('Wallet disconnected and logged out');
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
  };

  // ✅ Cas 1 : connecté via Google zkLogin → montrer un statut + bouton disconnect
  if (currentAccount && isConnectedViaGoogleZkLogin()) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm">
          <div className="font-medium">
            {currentAccount.address.slice(0, 6)}...{currentAccount.address.slice(-4)}
          </div>
          <div className="text-xs text-green-600">
            ✓ Google zkLogin
          </div>
        </div>
        <Button onClick={handleDisconnect} variant="outline" size="sm">
          Disconnect
        </Button>
      </div>
    );
  }

  // ⚠️ Cas 2 : connecté via un autre wallet (ex : Slush) → prévenir + proposer Google
  if (currentAccount && !isConnectedViaGoogleZkLogin()) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-sm text-orange-600">
          ⚠️ Connected with another wallet
        </div>
        <div className="flex gap-2">
          <Button onClick={handleGoogleLogin} variant="default" disabled={isConnecting}>
            {isConnecting ? 'Connecting...' : 'Sign in with Google zkLogin'}
          </Button>
          <Button onClick={handleDisconnect} variant="ghost" size="sm">
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  // Cas 3 : pas connecté → bouton Google zkLogin
  return (
    <div className="flex gap-2">
      <Button onClick={handleGoogleLogin} variant="default" className="bg-blue-600 hover:bg-blue-700" disabled={isConnecting}>
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Sign in with Google zkLogin
      </Button>
    </div>
  );
}

