import { useState, useEffect } from 'react';
import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TIER_NAMES } from '@/config/sui';
import { suivisionTxUrl } from '@/utils/explorers';

interface AnalysisEvent {
  timestamp: number;
  text: string;
  tier: number;
  txDigest: string;
  user: string;
  tokensRemaining: number;
}

export function AnalysisHistory() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [events, setEvents] = useState<AnalysisEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account?.address) return;

    const fetchEvents = async () => {
      setLoading(true);
      try {
        // Query transactions from this address
        const txs = await client.queryTransactionBlocks({
          filter: {
            FromAddress: account.address,
          },
          options: {
            showEvents: true,
            showEffects: true,
          },
          limit: 50,
          order: 'descending',
        });

        // Filter for TextAnalyzed events
        const analysisEvents: AnalysisEvent[] = [];
        
        txs.data.forEach((tx) => {
          if (tx.events) {
            tx.events.forEach((event) => {
              if (event.type.includes('analyzer::TextAnalyzed')) {
                const parsedEvent = event.parsedJson as any;
                
                // Decode text from vector<u8>
                let decodedText = '';
                try {
                  if (Array.isArray(parsedEvent.text)) {
                    decodedText = new TextDecoder().decode(new Uint8Array(parsedEvent.text));
                  } else {
                    decodedText = String(parsedEvent.text);
                  }
                } catch (e) {
                  decodedText = 'Unable to decode text';
                }

                analysisEvents.push({
                  timestamp: Number(tx.timestampMs || Date.now()),
                  text: decodedText,
                  tier: Number(parsedEvent.tier_id),
                  user: parsedEvent.user,
                  txDigest: tx.digest,
                  tokensRemaining: Number(parsedEvent.tokens_remaining) || 0,
                });
              }
            });
          }
        });

        setEvents(analysisEvents);
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
    
    // Refresh every 15 seconds
    const interval = setInterval(fetchEvents, 15000);
    return () => clearInterval(interval);
  }, [account?.address, client]);

  if (!account) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analysis History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Connect your wallet to view analysis history</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analysis History</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && events.length === 0 ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground">
            No analysis history yet. Submit your first text analysis from the Home page!
          </p>
        ) : (
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {events.map((event, idx) => (
              <div key={idx} className="border rounded-lg p-4 hover:bg-accent transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="default">
                    {TIER_NAMES[event.tier as 0 | 1 | 2]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm mb-3 break-words whitespace-pre-wrap">
                  {event.text}
                </p>
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="text-muted-foreground font-mono">
                    {event.user.slice(0, 6)}...{event.user.slice(-4)}
                  </span>
                  <span className="text-muted-foreground">
                    {event.tokensRemaining} tokens remaining
                  </span>
                </div>
                <div className="flex justify-end">
                  <a
                    href={suivisionTxUrl(event.txDigest, 'testnet')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-xs"
                  >
                    View on Explorer →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

