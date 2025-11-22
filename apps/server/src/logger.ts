import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  data?: any;
}

function formatLog(entry: LogEntry): string {
  const dataStr = entry.data ? `\n${JSON.stringify(entry.data, null, 2)}` : '';
  return `[${entry.timestamp}] [${entry.level}] [${entry.context}] ${entry.message}${dataStr}\n`;
}

function writeLog(entry: LogEntry): void {
  const formatted = formatLog(entry);
  
  // Write to console
  console.log(formatted);
  
  // Write to file
  try {
    fs.appendFileSync(LOG_FILE, formatted);
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

export const logger = {
  info: (context: string, message: string, data?: any) => {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      context,
      message,
      data,
    });
  },

  error: (context: string, message: string, data?: any) => {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      context,
      message,
      data,
    });
  },

  warn: (context: string, message: string, data?: any) => {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      context,
      message,
      data,
    });
  },

  debug: (context: string, message: string, data?: any) => {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      context,
      message,
      data,
    });
  },

  clearLog: () => {
    try {
      fs.writeFileSync(LOG_FILE, '');
      console.log('Log file cleared');
    } catch (error) {
      console.error('Failed to clear log file:', error);
    }
  },
};

