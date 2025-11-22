interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  data?: any;
}

const logs: LogEntry[] = [];
const MAX_LOGS = 1000;

function formatLog(entry: LogEntry): string {
  const dataStr = entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : '';
  return `[${entry.timestamp}] [${entry.level}] [${entry.context}] ${entry.message}${dataStr}`;
}

function writeLog(entry: LogEntry): void {
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.shift(); // Remove oldest log
  }
  
  const formatted = formatLog(entry);
  
  // Write to console with appropriate level
  switch (entry.level) {
    case 'ERROR':
      console.error(formatted, entry.data);
      break;
    case 'WARN':
      console.warn(formatted, entry.data);
      break;
    case 'DEBUG':
      console.debug(formatted, entry.data);
      break;
    default:
      console.log(formatted, entry.data);
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

  getLogs: () => logs,

  clearLogs: () => {
    logs.length = 0;
    console.clear();
  },

  downloadLogs: () => {
    const logText = logs.map(formatLog).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sui-lens-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// Make logger available in console for debugging
(window as any).logger = logger;

