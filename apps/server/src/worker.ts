import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { analyzePackage } from './analyze.js';
import { AnalysisJobData } from './queue.js';
import { logger } from './logger.js';
import { processAnalysisForRag } from './services/rag/index.js';

// Create Redis connection
const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
});

// Create worker
export const analysisWorker = new Worker(
  'analysis',
  async (job: Job<AnalysisJobData>) => {
    logger.info('worker', `Processing job ${job.id}`, { data: job.data });

    try {
      // Update progress: starting
      await job.updateProgress(10);

      // Run the analysis with userId from job data
      const analysisId = await analyzePackage(
        { ...job.data, userId: job.data.userId },
        async (progress: number) => {
          // Analysis progress: 0-90%
          await job.updateProgress(Math.round(progress * 0.9));
        }
      );

      logger.info('worker', `Job ${job.id} analysis phase completed`, { analysisId });

      // Update progress: starting RAG processing (90%)
      await job.updateProgress(90);

      // Start RAG processing (now synchronous with progress tracking)
      // This will: fetch source codes, generate LLM analyses, index for RAG
      logger.info('worker', `Starting RAG processing for analysis ${analysisId}`);
      
      try {
        await processAnalysisForRag(analysisId, async (current, total, message) => {
          // RAG progress: 90-100%
          const ragProgress = 90 + Math.round((current / total) * 10);
          await job.updateProgress(Math.min(ragProgress, 99)); // Cap at 99 until fully done
          logger.debug('worker', `RAG progress: ${current}/${total} - ${message}`);
        });
      } catch (ragError: any) {
        logger.error('worker', `RAG processing failed for analysis ${analysisId}`, {
          error: ragError.message,
        });
        // Continue anyway - analysis is complete even if RAG fails
      }

      // Update progress: complete
      await job.updateProgress(100);

      logger.info('worker', `Job ${job.id} completed`, { analysisId });
      return analysisId;
    } catch (error: any) {
      logger.error('worker', `Job ${job.id} failed`, { error: error.message, stack: error.stack });
      throw error;
    }
  },
  {
    connection,
    concurrency: 2, // Process up to 2 jobs concurrently
    limiter: {
      max: 10, // Max 10 jobs
      duration: 60000, // per minute
    },
  }
);

// Event listeners
analysisWorker.on('completed', (job) => {
  logger.info('worker', `Job ${job.id} completed successfully`);
});

analysisWorker.on('failed', (job, err) => {
  logger.error('worker', `Job ${job?.id} failed`, { error: err.message });
});

analysisWorker.on('error', (err) => {
  logger.error('worker', 'Worker error', { error: err.message });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('worker', 'SIGTERM received, closing worker...');
  await analysisWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('worker', 'SIGINT received, closing worker...');
  await analysisWorker.close();
  process.exit(0);
});

