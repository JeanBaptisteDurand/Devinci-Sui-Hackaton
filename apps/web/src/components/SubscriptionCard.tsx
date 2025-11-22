import { useCurrentAccount } from '@mysten/dapp-kit';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SubscriptionTier, TIER_NAMES, TIER_DESCRIPTIONS, TIER_PRICES, TIER_PRICES_MIST } from '@/config/sui';
import { useSuiTransactions } from '@/hooks/use-sui-transactions';
import { useSubscription } from '@/hooks/use-subscription';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';

interface SubscriptionCardProps {
  tier: SubscriptionTier;
  onSubscriptionChange?: () => void;
}

export function SubscriptionCard({ tier, onSubscriptionChange }: SubscriptionCardProps) {
  const account = useCurrentAccount();
  const { subscription } = useSubscription();
  const { subscribeTier, upgradeSubscription } = useSuiTransactions();
  const [isLoading, setIsLoading] = useState(false);

  const isCurrentTier = subscription?.tier === tier;
  const canUpgrade = subscription && subscription.tier < tier;
  const isLowerTier = subscription && subscription.tier > tier;

  // Calculate total cost including estimated network fee
  const getEstimatedGasFee = () => '0.02';
  const getSubscriptionPrice = () => {
    const priceInMist = TIER_PRICES_MIST[tier];
    return (priceInMist / 1_000_000_000).toFixed(1);
  };
  const getTotalCost = () => {
    const price = parseFloat(getSubscriptionPrice());
    const gas = parseFloat(getEstimatedGasFee());
    return (price + gas).toFixed(2);
  };

  const handleSubscribe = async () => {
    if (!account) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet to subscribe.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await subscribeTier(tier);
      onSubscriptionChange?.();
    } catch (error) {
      // Error already handled in the hook
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (!account || !subscription) {
      return;
    }

    setIsLoading(true);
    try {
      await upgradeSubscription(subscription.id, subscription.tier, tier);
      onSubscriptionChange?.();
    } catch (error) {
      // Error already handled in the hook
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={`flex flex-col ${isCurrentTier ? 'border-primary border-2' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{TIER_NAMES[tier]}</CardTitle>
          {isCurrentTier && (
            <Badge variant="default">Active</Badge>
          )}
        </div>
        <CardDescription>{TIER_DESCRIPTIONS[tier]}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <div>
          <div className="text-3xl font-bold text-primary">{TIER_PRICES[tier]}</div>
          <p className="text-sm text-muted-foreground mt-1">+ 1000 analysis tokens</p>
        </div>

        {/* Cost Breakdown */}
        <div className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-2">
          {canUpgrade ? (
            // Upgrade pricing
            <>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Upgrade cost:</span>
                <span className="font-semibold">
                  {((TIER_PRICES_MIST[tier] - TIER_PRICES_MIST[subscription.tier]) / 1_000_000_000).toFixed(1)} SUI
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Network fee (est.):</span>
                <span>~{getEstimatedGasFee()} SUI</span>
              </div>
              <div className="border-t border-border/50 pt-2 flex justify-between items-center">
                <span className="text-sm font-semibold">Total:</span>
                <span className="text-sm font-bold text-primary">
                  ~{((TIER_PRICES_MIST[tier] - TIER_PRICES_MIST[subscription.tier]) / 1_000_000_000 + parseFloat(getEstimatedGasFee())).toFixed(2)} SUI
                </span>
              </div>
              <div className="pt-2 text-xs text-green-600 dark:text-green-400">
                ✓ Your {subscription.tokenBalance} tokens will be preserved + 1000 bonus!
              </div>
            </>
          ) : (
            // New subscription pricing
            <>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Subscription:</span>
                <span className="font-semibold">{TIER_PRICES[tier]}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Network fee (est.):</span>
                <span>~{getEstimatedGasFee()} SUI</span>
              </div>
              <div className="border-t border-border/50 pt-2 flex justify-between items-center">
                <span className="text-sm font-semibold">Total:</span>
                <span className="text-sm font-bold text-primary">~{getTotalCost()} SUI</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-md">
          <span className="text-xs">💡</span>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Network fee secures your transaction on Sui blockchain
          </p>
        </div>
      </CardContent>
      <CardFooter>
        {canUpgrade ? (
          <Button 
            className="w-full" 
            onClick={handleUpgrade}
            disabled={isLoading || !account}
            variant="default"
          >
            {isLoading ? 'Upgrading...' : 'Upgrade Now'}
          </Button>
        ) : isLowerTier ? (
          <Button 
            className="w-full" 
            disabled
            variant="outline"
          >
            Lower Tier
          </Button>
        ) : (
          <Button 
            className="w-full" 
            onClick={handleSubscribe}
            disabled={isLoading || !account || isCurrentTier}
          >
            {isLoading ? 'Processing...' : isCurrentTier ? 'Active Subscription' : 'Subscribe Now'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
