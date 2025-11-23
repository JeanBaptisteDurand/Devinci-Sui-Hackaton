import { useState, useEffect } from 'react';
import { useCurrentAccount, ConnectButton } from '@mysten/dapp-kit';
import { useAuth } from '@/hooks/use-auth';
import { useZkLogin } from '@/hooks/use-zklogin';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function AuthButton() {
  const account = useCurrentAccount();
  const { isAuthenticated, user, login, loginWithZkLogin, logout, isLoading } = useAuth();
  const zkLogin = useZkLogin();
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Complete zkLogin authentication when zkProof is available
  useEffect(() => {
    if (zkLogin.isAuthenticated && zkLogin.address && zkLogin.zkProof && !isAuthenticated) {
      setIsAuthenticating(true);
      loginWithZkLogin(zkLogin.zkProof, zkLogin.address).then(() => {
        setIsAuthenticating(false);
        setShowLoginDialog(false);
      });
    }
  }, [zkLogin.isAuthenticated, zkLogin.address, zkLogin.zkProof, isAuthenticated, loginWithZkLogin]);

  // If authenticated, show user info and logout button
  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm">
          <div className="font-medium">
            {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
          </div>
          <div className="text-xs text-gray-500">
            {user.authProvider === 'zklogin' ? '🔐 zkLogin' : '💼 Slush'}
          </div>
        </div>
        <Button variant="outline" onClick={logout} size="sm">
          Logout
        </Button>
      </div>
    );
  }

  // Show login options
  return (
    <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
      <DialogTrigger asChild>
        <Button>Connect Wallet</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to SuiLens</DialogTitle>
          <DialogDescription>
            Choose your preferred authentication method
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Slush Wallet Option */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-gray-700">Self-Custodial Wallet</h3>
            <div className="bg-gray-50 p-4 rounded-lg border space-y-3">
              <ConnectButton />
              
              {/* Show Sign button if wallet is connected but not authenticated */}
              {account?.address && !isAuthenticated && (
                <>
                  <div className="text-xs text-gray-600 pt-2">
                    ✅ Wallet connected: {account.address.slice(0, 6)}...{account.address.slice(-4)}
                  </div>
                  <Button 
                    onClick={() => {
                      login();
                      setShowLoginDialog(false);
                    }} 
                    disabled={isLoading}
                    className="w-full"
                    variant="default"
                  >
                    {isLoading ? 'Signing...' : '✍️ Sign to Authenticate'}
                  </Button>
                </>
              )}
              
              <p className="text-xs text-gray-500">
                Connect with Slush or other Sui wallets. You'll need SUI for gas.
              </p>
            </div>
          </div>

          {/* zkLogin Option - TEMPORARILY HIDDEN */}
          {false && ( // Change to true when zkLogin is implemented
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Or</span>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-medium text-sm text-gray-700">Social Login (Gas Sponsored)</h3>
                <Button
                  onClick={zkLogin.loginWithGoogle}
                  disabled={zkLogin.isInitializing || isAuthenticating}
                  className="w-full bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  size="lg"
                >
                  {zkLogin.isInitializing || isAuthenticating ? (
                    'Authenticating...'
                  ) : (
                    <>
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
                      Continue with Google
                    </>
                  )}
                </Button>
                <p className="text-xs text-gray-500">
                  No wallet needed. Gas fees are sponsored. Perfect for users new to Sui.
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

