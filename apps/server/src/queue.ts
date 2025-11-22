import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { logger } from './logger.js';
import prisma from './prismaClient.js';

// Create Redis connection
const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
});

// Create analysis queue
export const analysisQueue = new Queue('analysis', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 100,
    },
    removeOnFail: {
      age: 604800, // Keep failed jobs for 7 days
    },
  },
});

export interface AnalysisJobData {
  packageId: string;
  maxPkgDepth?: number;
  maxObjDepth?: number;
  typeCountThreshold?: number;
  sampleLargeTypes?: boolean;
  eventsWindowDays?: number;
  criticalTypes?: string[];
  userId?: string; // User who requested the analysis
}

export interface JobStatusData {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  analysisId?: string;
  network?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Add a new analysis job to the queue
 */
export async function enqueueAnalysis(data: AnalysisJobData): Promise<string> {
  const job = await analysisQueue.add('analyze', data, {
    jobId: `analysis-${data.packageId}-${Date.now()}`,
  });
  return job.id!;
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<JobStatusData | null> {
  const job = await analysisQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const progress = job.progress as number || 0;

  let status: JobStatusData['status'];
  switch (state) {
    case 'waiting':
    case 'delayed':
      status = 'queued';
      break;
    case 'active':
      status = 'running';
      break;
    case 'completed':
      status = 'done';
      break;
    case 'failed':
      status = 'error';
      break;
    default:
      status = 'queued';
  }

  // Fetch network from analysis if job is completed
  let network: string | undefined;
  const analysisId = job.returnvalue as string | undefined;
  if (analysisId && status === 'done') {
    try {
      const analysis = await prisma.analysis.findUnique({
        where: { id: analysisId },
        select: { network: true },
      });
      network = analysis?.network;
    } catch (error: any) {
      logger.error('queue', 'Failed to fetch network from analysis', { error: error.message, analysisId });
    }
  }

  const result = {
    jobId,
    status,
    progress,
    analysisId,
    network,
    error: job.failedReason,
    createdAt: job.timestamp,
    updatedAt: job.processedOn || job.timestamp,
  };

  logger.debug('queue', `Job status retrieved`, { jobId, state, returnvalue: job.returnvalue, result });

  return result;
}

