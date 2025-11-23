import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { logger } from '../utils/logger';
import { SubscriptionCard } from '@/components/SubscriptionCard';
import { SubscriptionTier } from '@/config/sui';
import { useSubscription } from '@/hooks/use-subscription';
import { useSuiTransactions } from '@/hooks/use-sui-transactions';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Zap, Loader2, AlertCircle } from 'lucide-react';

export function Home() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { subscription, hasTokens, tokenBalance, refetch } = useSubscription();
  const { analyzeText } = useSuiTransactions();
  const { ensureAuthenticated, getAuthHeaders, isAuthenticated } = useAuth();
  const [packageId, setPackageId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [network, setNetwork] = useState<string | null>(null);
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  const pollJobStatus = async (jobId: string): Promise<string> => {
    const maxAttempts = 600; // 10 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`/api/analyze/${jobId}/status`, {
          headers: getAuthHeaders() as HeadersInit,
        });

        if (!response.ok) throw new Error('Failed to check job status');

        const data = await response.json();
        setProgress(data.progress || 0);
        if (data.network) setNetwork(data.network);

        if ((data.status === 'completed' || data.status === 'done') && data.analysisId) {
          return data.analysisId;
        }

        if (data.status === 'failed' || data.status === 'error') {
          throw new Error(data.error || data.failedReason || 'Analysis job failed');
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      } catch (err: any) {
        logger.error('Home', 'Error polling job status', { error: err.message });
        throw err;
      }
    }
    throw new Error('Analysis timed out');
  };

  useEffect(() => {
    if (account?.address && !isAuthenticated) {
      ensureAuthenticated();
    }
  }, [account?.address, isAuthenticated, ensureAuthenticated]);

  const handleAnalyze = async () => {
    if (!packageId.trim()) {
      toast({ title: 'Empty Package ID', description: 'Please enter a package ID.', variant: 'destructive' });
      return;
    }

    const authenticated = await ensureAuthenticated();
    if (!authenticated) {
      toast({ title: 'Authentication Required', description: 'Please sign to authenticate.', variant: 'destructive' });
      return;
    }

    if (!subscription) {
      toast({ title: 'No Subscription', description: 'Active subscription required.', variant: 'destructive' });
      return;
    }

    if (!hasTokens) {
      toast({ title: 'Insufficient Tokens', description: `Need 5 tokens. Balance: ${tokenBalance}`, variant: 'destructive' });
      return;
    }

    setLoading(true);
    setIsSubmittingTx(true);
    setError(null);
    setProgress(0);

    try {
      // Step 1: Blockchain transaction
      await analyzeText(packageId.trim(), subscription.id, 2); // Hardcoded depth 2
      setIsSubmittingTx(false);

      // Step 2: Backend analysis
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getAuthHeaders() as HeadersInit) },
        body: JSON.stringify({ packageId: packageId.trim(), maxPkgDepth: 2 }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Analysis failed');
      }

      const data = await response.json();
      const analysisId = await pollJobStatus(data.jobId);

      navigate(`/graph/${analysisId}`);
      setPackageId('');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to analyze package';
      setError(errorMessage);
      toast({ title: 'Analysis Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setLoading(false);
      setIsSubmittingTx(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto space-y-12">
        
        {/* Header Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Sui Package Analyzer</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Deep dive into any Sui package. Visualize dependencies, understand structure, and get AI-powered insights.
          </p>
        </div>

        {/* Main Analysis Card */}
        <Card className="border-2 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Analyze Package
            </CardTitle>
            <CardDescription>
              Enter a package ID to generate a comprehensive graph and analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  placeholder="Enter Package ID (e.g., 0x2)"
                  className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loading}
                />
              </div>
              <Button 
                size="lg" 
                onClick={handleAnalyze}
                disabled={loading || !packageId.trim()}
                className="h-12 px-8"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isSubmittingTx ? 'Confirming...' : 'Analyzing...'}
                  </>
                ) : (
                  'Start Analysis'
                )}
              </Button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-md text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            {/* Status & Progress */}
            {loading && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    {isSubmittingTx ? 'Waiting for wallet confirmation...' : 'Processing package...'}
                    {network && <span className="ml-2 text-primary">({network})</span>}
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${isSubmittingTx ? 5 : Math.max(5, progress)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Account Status Info */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${account ? 'bg-green-500' : 'bg-yellow-500'}`} />
                {account ? 'Wallet Connected' : 'Wallet Not Connected'}
              </div>
              <div className="h-4 w-px bg-border" />
              <div>
                Tokens: <span className="font-medium text-foreground">{tokenBalance ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Refuel Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 justify-center">
            <Zap className="h-5 w-5 text-yellow-500" />
            <h2 className="text-2xl font-bold">Refuel your analysis tokens</h2>
          </div>
          
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <SubscriptionCard 
                tier={SubscriptionTier.BASIC} 
                onSubscriptionChange={refetch}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
