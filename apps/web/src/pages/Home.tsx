import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { logger } from '../utils/logger';
import { SubscriptionCard } from '@/components/SubscriptionCard';
import { SubscriptionTier } from '@/config/sui';
import { useSubscription } from '@/hooks/use-subscription';
import { useSuiTransactions } from '@/hooks/use-sui-transactions';
import { useSponsoredTransactions } from '@/hooks/use-sponsored-transactions';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';

export function Home() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { subscription, hasSubscription, tokenBalance, hasTokens, refetch } = useSubscription();
  const { analyzeText } = useSuiTransactions();
  const { analyzeTextSponsored } = useSponsoredTransactions();
  const { ensureAuthenticated, getAuthHeaders, isAuthenticated, user } = useAuth();
  const [packageId, setPackageId] = useState('');
  const [maxPkgDepth, setMaxPkgDepth] = useState(2); // Default: analyze 2 levels deep
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [network, setNetwork] = useState<string | null>(null);
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  const pollJobStatus = async (jobId: string): Promise<string> => {
    const maxAttempts = 600; // 10 minutes max (600 * 1 second) - increased for RAG processing
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        logger.debug('Home', `Polling job status (attempt ${attempts + 1})`, { jobId });

        const response = await fetch(`/api/analyze/${jobId}/status`, {
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error('Failed to check job status');
        }

        const data = await response.json();
        logger.debug('Home', 'Job status received', { status: data.status, progress: data.progress, network: data.network });

        setProgress(data.progress || 0);
        if (data.network) {
          setNetwork(data.network);
        }

        // BullMQ maps 'completed' to 'done' in the backend
        if ((data.status === 'completed' || data.status === 'done') && data.analysisId) {
          logger.info('Home', 'Job completed', { analysisId: data.analysisId });
          return data.analysisId;
        }

        if (data.status === 'failed' || data.status === 'error') {
          // Use error field from job status (which contains failedReason)
          const errorMessage = data.error || data.failedReason || 'Analysis job failed';
          throw new Error(errorMessage);
        }

        // Wait 1 second before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      } catch (err: any) {
        logger.error('Home', 'Error polling job status', { error: err.message });
        throw err;
      }
    }

    throw new Error('Analysis timed out');
  };

  // Ensure authentication when wallet is connected
  useEffect(() => {
    if (account?.address && !isAuthenticated) {
      ensureAuthenticated();
    }
  }, [account?.address, isAuthenticated, ensureAuthenticated]);

  const handleAnalyze = async () => {
    if (!packageId.trim()) {
      logger.warn('Home', 'Empty package ID submitted');
      setError('Please enter a package ID');
      toast({
        title: 'Empty Package ID',
        description: 'Please enter a package ID to analyze.',
        variant: 'destructive',
      });
      return;
    }

    // Ensure authenticated
    const authenticated = await ensureAuthenticated();
    if (!authenticated) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign the message to authenticate.',
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

    logger.info('Home', `Starting analysis for package: ${packageId.trim()}`);
    setLoading(true);
    setIsSubmittingTx(true);
    setError(null);
    setProgress(0);
    setNetwork(null);

    try {
      // Step 1: Send blockchain transaction (for subscription/token management)
      logger.debug('Home', 'Sending blockchain transaction', {
        packageId: packageId.trim(),
        subscriptionId: subscription.id,
        authProvider: user?.authProvider,
      });

      toast({
        title: 'Sending Transaction',
        description: user?.authProvider === 'zklogin' 
          ? 'Submitting sponsored transaction...'
          : 'Submitting analysis request to blockchain...',
      });

      // Use sponsored transaction for zkLogin users, regular transaction for Slush users
      const txResult = user?.authProvider === 'zklogin'
        ? await analyzeTextSponsored(packageId.trim(), subscription.id, maxPkgDepth)
        : await analyzeText(packageId.trim(), subscription.id, maxPkgDepth);
        
      logger.info('Home', 'Blockchain transaction complete', { 
        digest: txResult.digest,
        authProvider: user?.authProvider 
      });
      console.log('✅ Blockchain transaction complete!');
      console.log('📋 Transaction:', txResult.digest);

      setIsSubmittingTx(false);

      // Step 2: Submit to backend API for actual analysis
      logger.debug('Home', 'Sending POST request to /api/analyze', {
        packageId: packageId.trim(),
        maxPkgDepth,
      });

      toast({
        title: 'Starting Analysis',
        description: 'Processing package...',
      });

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          packageId: packageId.trim(),
          maxPkgDepth,
        }),
      });

      logger.debug('Home', `Response received: ${response.status} ${response.statusText}`, {
        status: response.status,
        ok: response.ok,
      });

      if (!response.ok) {
        const data = await response.json();
        logger.error('Home', 'Analysis request failed', { status: response.status, error: data.error });
        throw new Error(data.error || 'Analysis failed');
      }

      const data = await response.json();
      logger.info('Home', 'Job queued, waiting for completion', { jobId: data.jobId });

      // Step 3: Poll for job completion
      const analysisId = await pollJobStatus(data.jobId);

      // Step 4: Navigate to results
      logger.info('Home', 'Analysis successful, navigating to graph view', { analysisId });
      toast({
        title: 'Analysis Complete!',
        description: 'Navigating to graph view...',
      });
      navigate(`/graph/${analysisId}`);
      setPackageId(''); // Clear after successful analysis
    } catch (err: any) {
      logger.error('Home', 'Analysis error', { error: err.message, stack: err.stack });
      // Display error message - "Invalid address" will be shown clearly
      const errorMessage = err.message || 'Failed to analyze package';
      setError(errorMessage);
      toast({
        title: errorMessage.includes('Invalid address') ? 'Invalid Address' : 'Analysis Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsSubmittingTx(false);
      setProgress(0);
      setNetwork(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Analysis Section */}
        <section>
          <div className="bg-white rounded-lg shadow-lg p-8 border border-gray-200">
            <h1 className="text-3xl font-bold mb-4 text-gray-800">
              Analyze Sui Package
            </h1>
            <p className="text-gray-600 mb-6">
              {!account && 'Connect your wallet to use the analyzer'}
              {account && !hasSubscription && 'Subscribe to a tier to use the analyzer'}
              {account && hasSubscription && !hasTokens && `Insufficient tokens (need 5, have ${tokenBalance})`}
              {account && hasSubscription && hasTokens && `Enter a Sui Move package ID to analyze its dependencies and visualize the graph (${tokenBalance} tokens remaining)`}
            </p>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="packageId"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Package ID
                </label>
                <input
                  id="packageId"
                  type="text"
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  placeholder="0x2"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={loading || !account || !hasSubscription || !hasTokens}
                />
                <p className="mt-2 text-sm text-gray-500">
                  Example: <code className="bg-gray-100 px-1 rounded">0x2</code> (Sui
                  Framework)
                </p>
              </div>

              <div>
                <label
                  htmlFor="maxPkgDepth"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Analysis Depth
                </label>
                <select
                  id="maxPkgDepth"
                  value={maxPkgDepth}
                  onChange={(e) => setMaxPkgDepth(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={loading || !account || !hasSubscription || !hasTokens}
                >
                  <option value={1}>Level 1 - Analyze only this package</option>
                  <option value={2}>Level 2 - Include direct dependencies (Recommended)</option>
                  <option value={3}>Level 3 - Include nested dependencies (Slower)</option>
                </select>
                <p className="mt-2 text-sm text-gray-500">
                  Higher depth = more modules analyzed = longer processing time
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              {loading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>
                      {isSubmittingTx ? 'Submitting transaction...' : 'Analyzing package...'}
                      {network && <span className="ml-2 text-blue-600">({network})</span>}
                    </span>
                    <span>{isSubmittingTx ? '0' : Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${isSubmittingTx ? 0 : Math.round(progress)}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleAnalyze}
                disabled={loading || !packageId.trim() || !account || !hasSubscription || !hasTokens}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-md hover:shadow-lg"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {isSubmittingTx ? 'Submitting Transaction...' : 'Analyzing...'}
                  </span>
                ) : !account ? (
                  'Connect Wallet'
                ) : !hasSubscription ? (
                  'Subscribe to Analyze'
                ) : !hasTokens ? (
                  'Insufficient Tokens'
                ) : (
                  'Analyze Package'
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Subscription Tiers Section */}
        <section>
          <h2 className="text-3xl font-bold text-center mb-8">
            Choose Your Subscription Tier
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <SubscriptionCard 
              tier={SubscriptionTier.BASIC} 
              onSubscriptionChange={refetch}
            />
            <SubscriptionCard 
              tier={SubscriptionTier.PRO} 
              onSubscriptionChange={refetch}
            />
            <SubscriptionCard 
              tier={SubscriptionTier.ELITE} 
              onSubscriptionChange={refetch}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
