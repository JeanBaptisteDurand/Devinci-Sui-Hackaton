import { SuiClient, SuiEventFilter } from '@mysten/sui/client';
import { getSuiClient } from '../sui';
import prisma from '../prismaClient';
import { Queue } from 'bullmq';

// Import the package ID from the smart contract
const PACKAGE_ID = '0xa5b256d451691f7ac3d348efb24fe30bc9a67214c92fab9374f3b8a2eddc6925';
const ANALYZER_MODULE = 'analyzer';

interface TextAnalyzedEvent {
  user: string;
  tier_id: number;
  package_id: number[]; // vector<u8> comes as number array
  tokens_remaining: string;
}

export class BlockchainEventListener {
  private client: SuiClient;
  private queue: Queue;
  private isListening: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastProcessedCheckpoint: bigint = BigInt(0);

  constructor(queue: Queue) {
    this.client = getSuiClient('testnet'); // Use testnet by default
    this.queue = queue;
  }

  /**
   * Start listening for TextAnalyzed events
   */
  async start() {
    if (this.isListening) {
      console.log('Event listener already running');
      return;
    }

    this.isListening = true;
    console.log('🎧 Starting blockchain event listener...');

    // Load last processed checkpoint from database or start from latest
    const lastAnalysis = await prisma.analysis.findFirst({
      where: { txDigest: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    if (lastAnalysis) {
      console.log(`📍 Resuming from last analysis: ${lastAnalysis.id}`);
    }

    // Poll for events every 5 seconds
    this.pollInterval = setInterval(() => this.pollEvents(), 5000);
    
    // Initial poll
    await this.pollEvents();
  }

  /**
   * Stop listening for events
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isListening = false;
    console.log('🛑 Stopped blockchain event listener');
  }

  /**
   * Poll for new TextAnalyzed events
   */
  private async pollEvents() {
    try {
      const eventFilter: SuiEventFilter = {
        MoveEventType: `${PACKAGE_ID}::${ANALYZER_MODULE}::TextAnalyzed`,
      };

      // Query events
      const events = await this.client.queryEvents({
        query: eventFilter,
        limit: 50,
        order: 'descending',
      });

      if (events.data.length === 0) {
        return;
      }

      console.log(`📨 Found ${events.data.length} potential new events`);

      // Process events in reverse order (oldest first)
      for (const event of events.data.reverse()) {
        await this.processEvent(event);
      }
    } catch (error: any) {
      console.error('❌ Error polling events:', error.message);
    }
  }

  /**
   * Process a single TextAnalyzed event
   */
  private async processEvent(event: any) {
    try {
      const txDigest = event.id.txDigest;
      
      // Check if we already processed this transaction
      const existing = await prisma.analysis.findUnique({
        where: { txDigest },
      });

      if (existing) {
        return; // Already processed
      }

      const eventData = event.parsedJson as TextAnalyzedEvent;
      
      // Decode package_id from vector<u8> to string
      const packageId = new TextDecoder().decode(new Uint8Array(eventData.package_id));
      const walletAddress = eventData.user;
      const tier = eventData.tier_id;

      console.log(`\n🔔 New analysis request detected:`);
      console.log(`   📦 Package: ${packageId}`);
      console.log(`   👤 User: ${walletAddress}`);
      console.log(`   🎫 Tier: ${tier}`);
      console.log(`   🔗 TX: ${txDigest}`);

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { walletAddress },
      });

      if (!user) {
        user = await prisma.user.create({
          data: { 
            walletAddress,
            tier,
          },
        });
        console.log(`   ✅ Created new user: ${user.id}`);
      }

      // Generate a slug for the analysis
      const slug = `${packageId.replace(/0x/, '')}-${Date.now()}`;

      // Create analysis record
      const analysis = await prisma.analysis.create({
        data: {
          packageId,
          network: 'testnet',
          userId: user.id,
          txDigest,
          slug,
          status: 'pending',
          progress: 0,
          depth: 2, // Default depth
          summaryJson: {}, // Will be filled by worker
        },
      });

      console.log(`   ✅ Created analysis record: ${analysis.id}`);

      // Queue the analysis job
      const job = await this.queue.add('analyze-package', {
        analysisId: analysis.id,
        packageId,
        network: 'testnet',
        maxPkgDepth: 2,
        userId: user.id,
      });

      console.log(`   ✅ Queued analysis job: ${job.id}`);
      console.log(`   🔗 View at: /graph/${slug}\n`);

    } catch (error: any) {
      console.error(`❌ Error processing event:`, error.message);
    }
  }
}

let listener: BlockchainEventListener | null = null;

/**
 * Initialize and start the blockchain event listener
 */
export function startEventListener(queue: Queue) {
  if (!listener) {
    listener = new BlockchainEventListener(queue);
  }
  listener.start();
  return listener;
}

/**
 * Stop the blockchain event listener
 */
export function stopEventListener() {
  if (listener) {
    listener.stop();
  }
}

