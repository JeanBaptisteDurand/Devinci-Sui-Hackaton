import { useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSubscription } from '@/hooks/use-subscription';
// import { useSuiTransactions } from '@/hooks/use-sui-transactions'; // Keep for later blockchain integration
import { toast } from '@/hooks/use-toast';

export function TextAnalyzer() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { subscription, hasSubscription, tokenBalance, hasTokens } = useSubscription();
  // const { analyzeText } = useSuiTransactions(); // Keep for later blockchain integration
  const [packageId, setPackageId] = useState('');
  const [depth, setDepth] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [network, setNetwork] = useState<string | null>(null);

  const pollJobStatus = async (jobId: string): Promise<string> => {
    const maxAttempts = 600; // 10 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`/api/analyze/${jobId}/status`);
        if (!response.ok) {
          throw new Error('Failed to check job status');
        }

        const data = await response.json();
        setProgress(data.progress || 0);
        if (data.network) {
          setNetwork(data.network);
        }

        if ((data.status === 'completed' || data.status === 'done') && data.analysisId) {
          return data.analysisId;
        }

        if (data.status === 'failed' || data.status === 'error') {
          throw new Error(data.failedReason || 'Analysis job failed');
        }

        // Wait 1 second before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      } catch (err: any) {
        throw err;
      }
    }

    throw new Error('Analysis timed out');
  };

  const handleAnalyze = async () => {
    if (!packageId.trim()) {
      toast({
        title: 'Empty Package ID',
        description: 'Please enter a package ID to analyze.',
        variant: 'destructive',
      });
      return;
    }

    // TODO: Re-enable subscription and token checks when blockchain integration is ready
    // if (!subscription) {
    //   toast({
    //     title: 'No Subscription',
    //     description: 'You need an active subscription to analyze packages.',
    //     variant: 'destructive',
    //   });
    //   return;
    // }

    // if (!hasTokens) {
    //   toast({
    //     title: 'Insufficient Tokens',
    //     description: `You need at least 5 tokens. Current balance: ${tokenBalance} tokens.`,
    //     variant: 'destructive',
    //   });
    //   return;
    // }

    setIsAnalyzing(true);
    setProgress(0);
    setNetwork(null);

    try {
      // TODO: Re-enable blockchain transaction when ready
      // Step 1: Send blockchain transaction (for subscription/token management)
      // toast({
      //   title: 'Sending Transaction',
      //   description: 'Submitting analysis request to blockchain...',
      // });
      // 
      // const result = await analyzeText(packageId, subscription.id);
      // console.log('✅ Blockchain transaction complete!');
      // console.log('📋 Transaction:', result.digest);

      // Step 2: Submit to backend API for actual analysis
      toast({
        title: 'Starting Analysis',
        description: 'Processing package...',
      });

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: packageId.trim(),
          maxPkgDepth: depth,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Analysis failed');
      }

      const data = await response.json();
      console.log('Job queued:', data.jobId);

      // Step 3: Poll for completion
      const analysisId = await pollJobStatus(data.jobId);

      // Step 4: Navigate to results
      toast({
        title: 'Analysis Complete!',
        description: 'Navigating to graph view...',
      });
      
      navigate(`/graph/${analysisId}`);
      setPackageId(''); // Clear after successful analysis
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Failed to analyze package',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
      setNetwork(null);
    }
  };

  // TODO: Re-enable subscription and token checks when blockchain integration is ready
  // const isDisabled = !account || !hasSubscription || !hasTokens || isAnalyzing || !packageId.trim();
  const isDisabled = isAnalyzing || !packageId.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Package Analyzer</CardTitle>
        <CardDescription>
          {/* TODO: Re-enable when blockchain integration is ready */}
          {/* {!account && 'Connect your wallet to use the analyzer'} */}
          {/* {account && !hasSubscription && 'Subscribe to a tier to use the analyzer'} */}
          {/* {account && hasSubscription && !hasTokens && `Insufficient tokens (need 5, have ${tokenBalance})`} */}
          {/* {account && hasSubscription && hasTokens && `Enter a Sui package ID to analyze on-chain (${tokenBalance} tokens remaining)`} */}
          Enter a Sui package ID to analyze
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="packageId" className="text-sm font-medium">
            Package ID
          </label>
          <input
            id="packageId"
            type="text"
            placeholder="Package ID (e.g., 0x2 or 0x1::sui::SUI)"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            disabled={isAnalyzing}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="depth" className="text-sm font-medium">
            Analysis Depth
          </label>
          <select
            id="depth"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isAnalyzing}
          >
            <option value={1}>Level 1 - Analyze only this package</option>
            <option value={2}>Level 2 - Include direct dependencies (Recommended)</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Higher depth = more modules analyzed = longer processing time
          </p>
        </div>
        
        {/* Progress Bar - Show during analysis */}
        {isAnalyzing && (
          <div className="space-y-3 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
            <div className="flex justify-between items-center text-sm">
              <span className="font-semibold text-blue-900">
                Analyzing package...
                {network && <span className="ml-2 text-blue-600">({network})</span>}
              </span>
              <span className="font-bold text-blue-900">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-3" />
            <p className="text-xs text-blue-700">
              {progress < 20 && 'Initializing analysis...'}
              {progress >= 20 && progress < 50 && 'Fetching package data...'}
              {progress >= 50 && progress < 80 && 'Processing modules and dependencies...'}
              {progress >= 80 && progress < 100 && 'Finalizing graph structure...'}
              {progress >= 100 && 'Complete! Redirecting...'}
            </p>
          </div>
        )}

        {/* TODO: Re-enable cost breakdown when blockchain integration is ready */}
        {/* Cost Breakdown - Only show when user has subscription and not analyzing */}
        {/* {hasSubscription && hasTokens && !isAnalyzing && (
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
        )} */}
      </CardContent>
      <CardFooter className="flex-col gap-2">
        {/* TODO: Re-enable token balance warning when blockchain integration is ready */}
        {/* {hasSubscription && tokenBalance < 20 && tokenBalance >= 5 && (
          <div className="w-full text-sm text-amber-600 dark:text-amber-400 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-md">
            ⚠️ Low token balance: {tokenBalance} tokens remaining
          </div>
        )} */}
        <Button 
          onClick={handleAnalyze}
          disabled={isDisabled}
          className="w-full"
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze Package'}
        </Button>
      </CardFooter>
    </Card>
  );
}
