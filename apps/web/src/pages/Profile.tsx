import { useCurrentAccount } from '@mysten/dapp-kit';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useSubscription } from '@/hooks/use-subscription';
import { TIER_NAMES } from '@/config/sui';
import { AnalysisHistory } from '@/components/AnalysisHistory';

export function Profile() {
  const account = useCurrentAccount();
  const { subscription, isLoading, tokenBalance } = useSubscription();

  if (!account) {
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Connect your wallet to view your profile</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Please connect your wallet to view your profile and subscription status.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Wallet Info */}
          <Card>
            <CardHeader>
              <CardTitle>Wallet Information</CardTitle>
              <CardDescription>Your connected wallet details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <span className="font-semibold">Address:</span>
                  <p className="text-sm text-muted-foreground font-mono break-all">
                    {account.address}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Subscription Status */}
          <Card>
            <CardHeader>
              <CardTitle>Subscription Status</CardTitle>
              <CardDescription>Your current subscription tier</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Loading subscription status...</p>
              ) : subscription ? (
                <div className="space-y-4">
                  <div>
                    <span className="font-semibold">Active Tier:</span>
                    <p className="text-2xl font-bold text-primary">
                      {TIER_NAMES[subscription.tier]}
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold">Token Balance:</span>
                    <p className="text-3xl font-bold">
                      {tokenBalance} 
                      <span className="text-lg text-muted-foreground ml-2">tokens</span>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      ≈ {Math.floor(tokenBalance / 5)} analyses remaining
                    </p>
                    {tokenBalance < 20 && tokenBalance >= 5 && (
                      <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                        ⚠️ Low balance - Consider subscribing again to get more tokens
                      </p>
                    )}
                    {tokenBalance < 5 && (
                      <p className="text-sm text-destructive mt-2">
                        ❌ Insufficient tokens - Subscribe again to continue analyzing
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold">NFT ID:</span>
                    <p className="text-sm text-muted-foreground font-mono break-all">
                      {subscription.id}
                    </p>
                  </div>
                  <div className="pt-4 border-t">
                    <p className="text-sm text-green-600 dark:text-green-400">
                      ✓ Your subscription is active
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Note: Subscriptions are non-transferable and locked to your wallet
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-muted-foreground">No active subscription found.</p>
                  <p className="text-sm text-muted-foreground">
                    Subscribe to a tier from the Home page to start using the text analyzer.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis History */}
          <AnalysisHistory />
        </div>
      </div>
    </div>
  );
}

