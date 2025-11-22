import { useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSubscription } from '@/hooks/use-subscription';
import { useSuiTransactions } from '@/hooks/use-sui-transactions';
import { toast } from '@/hooks/use-toast';

export function PackageAnalyzer() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { subscription, hasSubscription, tokenBalance, hasTokens } = useSubscription();
  const { analyzePackage } = useSuiTransactions();
  const [packageId, setPackageId] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (!packageId.trim()) {
      toast({
        title: 'Empty Package ID',
        description: 'Please enter a package ID to analyze.',
        variant: 'destructive',
      });
      return;
    }

    if (!subscription) {
      toast({
        title: 'No Subscription',
        description: 'You need an active subscription to analyze packages.',
        variant: 'destructive',
      });
      return;
    }

    if (!hasTokens) {
      toast({
        title: 'Insufficient Tokens',
        description: `You need at least 5 tokens. Current balance: ${tokenBalance} tokens.`,
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      // Pass the subscription NFT ID to the analyzer
      const result = await analyzePackage(packageId, subscription.id);
      console.log('✅ Analysis transaction complete!');
      console.log('📋 Transaction:', result.digest);
      console.log('🔗 View on Explorer:', 
        `https://suiexplorer.com/txblock/${result.digest}?network=testnet`);
      
      toast({
        title: 'Analysis Started',
        description: 'Backend is processing your analysis. Check History page for updates.',
      });
      
      setPackageId(''); // Clear package ID after successful submission
      
      // Navigate to history after a short delay
      setTimeout(() => {
        navigate('/history');
      }, 2000);
    } catch (error) {
      // Error already handled in the hook
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isDisabled = !account || !hasSubscription || !hasTokens || isAnalyzing || !packageId.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Package Analyzer</CardTitle>
        <CardDescription>
          {!account && 'Connect your wallet to use the analyzer'}
          {account && !hasSubscription && 'Subscribe to a tier to use the analyzer'}
          {account && hasSubscription && !hasTokens && `Insufficient tokens (need 5, have ${tokenBalance})`}
          {account && hasSubscription && hasTokens && `Enter a package ID to analyze on-chain (${tokenBalance} tokens remaining)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="Enter Sui package ID (e.g., 0x2)"
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
          className="min-h-[100px] font-mono"
          disabled={!account || !hasSubscription || !hasTokens}
        />
        
        {/* Cost Breakdown - Only show when user has subscription */}
        {hasSubscription && hasTokens && (
          <div className="p-4 bg-muted/50 rounded-lg border border-border">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Analysis cost:</span>
                <span className="font-semibold">5 tokens</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Network fee:</span>
                <span>~0.01 SUI (~$0.01)</span>
              </div>
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-start gap-2">
                  <span className="text-xs">ℹ️</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Small network fee paid to Sui validators for secure on-chain verification
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-col gap-2">
        {hasSubscription && tokenBalance < 20 && tokenBalance >= 5 && (
          <div className="w-full text-sm text-amber-600 dark:text-amber-400 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-md">
            ⚠️ Low token balance: {tokenBalance} tokens remaining
          </div>
        )}
        <Button 
          onClick={handleAnalyze}
          disabled={isDisabled}
          className="w-full"
        >
          {isAnalyzing ? 'Analyzing...' : hasTokens ? 'Analyze Package' : 'Insufficient Tokens'}
        </Button>
      </CardFooter>
    </Card>
  );
}

