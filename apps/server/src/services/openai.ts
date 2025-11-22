import OpenAI from 'openai';
import { logger } from '../logger.js';

// Initialize OpenAI client
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  logger.warn('openai', 'OPENAI_API_KEY not set. RAG and explanation features will not work.');
}

export const openai = new OpenAI({
  apiKey: apiKey || 'dummy-key', // Use dummy key if not set to prevent crashes
});

// Configuration
export const OPENAI_CONFIG = {
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  embeddingDimensions: 1536, // text-embedding-3-small dimensions
};

/**
 * Generate embeddings for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  try {
    const textPreview = text.length > 100 ? text.substring(0, 100) + '...' : text;
    logger.info('openai', '🔮 Calling OpenAI Embedding API', {
      model: OPENAI_CONFIG.embeddingModel,
      textLength: text.length,
      textPreview,
    });

    const startTime = Date.now();
    const response = await openai.embeddings.create({
      model: OPENAI_CONFIG.embeddingModel,
      input: text,
    });
    const duration = Date.now() - startTime;

    const embedding = response.data[0].embedding;
    
    logger.info('openai', '✅ OpenAI Embedding API response received', {
      duration: `${duration}ms`,
      embeddingDimension: embedding.length,
      usage: response.usage,
    });
    
    return embedding;
  } catch (error: any) {
    logger.error('openai', '❌ Failed to generate embedding', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Generate chat completion using OpenAI
 */
export async function generateChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  try {
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const userPrompt = messages.find(m => m.role === 'user')?.content || '';
    logger.info('openai', '🤖 Calling OpenAI Chat API', {
      model: OPENAI_CONFIG.chatModel,
      messagesCount: messages.length,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens,
      systemPromptPreview: systemPrompt.substring(0, 100) + '...',
      userPromptPreview: userPrompt.substring(0, 100) + '...',
    });

    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.chatModel,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
    });
    const duration = Date.now() - startTime;

    const content = response.choices[0]?.message?.content || '';
    
    logger.info('openai', '✅ OpenAI Chat API response received', {
      duration: `${duration}ms`,
      responseLength: content.length,
      responsePreview: content.substring(0, 150) + '...',
      usage: response.usage,
      finishReason: response.choices[0]?.finish_reason,
    });
    
    return content;
  } catch (error: any) {
    logger.error('openai', '❌ Failed to generate chat completion', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

