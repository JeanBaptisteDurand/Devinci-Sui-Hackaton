import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { logger } from '../utils/logger';

interface FunctionModalProps {
  func: {
    name: string;
    visibility: string;
    isEntry: boolean;
  };
  moduleName: string; // Full module FQN like "0xP::m"
  onClose: () => void;
}

interface FunctionDisassembly {
  name: string;
  visibility: string;
  isEntry: boolean;
  bytecode: string;
  instructions?: Array<{
    offset: number;
    opcode: string;
    operands?: string;
  }>;
  calls: Array<{
    module: string;
    func: string;
  }>;
  constants: Array<{
    offset: number;
    type: string;
    value: string | number;
  }>;
}

export default function FunctionModal({ func, moduleName, onClose }: FunctionModalProps) {
  const { id: analysisId } = useParams<{ id: string }>();
  const [disassembly, setDisassembly] = useState<FunctionDisassembly | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const TRUNCATE_LINES = 50;

  useEffect(() => {
    fetchDisassembly();
  }, [analysisId, moduleName, func.name]);

  // Extract only the specific function from full module source code
  const extractFunctionCode = (fullSourceCode: string, functionName: string): string => {
    const lines = fullSourceCode.split('\n');
    const funcRegex = new RegExp(`^\\s*((?:public(?:\\([^)]+\\))?\\s+|entry\\s+)*)fun\\s+${functionName}\\s*\\(`);
    
    let startLine = -1;
    let braceDepth = 0;
    let inFunction = false;
    const functionLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Find function start
      if (startLine === -1 && funcRegex.test(line.trim())) {
        startLine = i;
        inFunction = true;
        functionLines.push(line);
        
        // Count braces on the same line
        braceDepth += (line.match(/{/g) || []).length;
        braceDepth -= (line.match(/}/g) || []).length;
        
        continue;
      }

      // Collect function body
      if (inFunction) {
        functionLines.push(line);
        
        braceDepth += (line.match(/{/g) || []).length;
        braceDepth -= (line.match(/}/g) || []).length;

        // Function ended
        if (braceDepth === 0) {
          break;
        }
      }
    }

    if (functionLines.length === 0) {
      return `// Function ${functionName} not found in source code`;
    }

    return functionLines.join('\n');
  };

  const fetchDisassembly = async () => {
    if (!analysisId) {
      setError('Analysis ID not found');
      setLoading(false);
      return;
    }

    try {
      logger.info('FunctionModal', `Fetching source code for ${moduleName}::${func.name}`);
      
      const url = `/api/analysis/${analysisId}/source/${encodeURIComponent(moduleName)}/function/${encodeURIComponent(func.name)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch source code: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('FunctionModal', 'Source code fetched successfully', data);
      
      // Convert Revela function info to our format
      const funcInfo = data.function;
      const fullSourceCode = data.module?.sourceCode || '';
      
      // Extract ONLY this function's code (not the whole module)
      const functionCode = extractFunctionCode(fullSourceCode, funcInfo.name);
      
      setDisassembly({
        name: funcInfo.name,
        visibility: funcInfo.visibility,
        isEntry: funcInfo.visibility === 'entry',
        bytecode: functionCode, // Only this function's code
        instructions: [],
        calls: funcInfo.calls || [],
        constants: [],
      });
    } catch (err: any) {
      logger.error('FunctionModal', 'Failed to fetch source code', { error: err.message });
      setError(err.message || 'Failed to load source code');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!disassembly) return;
    
    try {
      await navigator.clipboard.writeText(disassembly.bytecode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('FunctionModal', 'Failed to copy to clipboard', { error: err });
    }
  };

  const renderBytecode = () => {
    if (!disassembly) return null;

    const lines = disassembly.bytecode.split('\n');
    const shouldTruncate = lines.length > TRUNCATE_LINES;
    const displayLines = expanded || !shouldTruncate ? lines : lines.slice(0, TRUNCATE_LINES);

    return (
      <div>
        <pre className="text-xs font-mono whitespace-pre-wrap break-all text-gray-100">
          {displayLines.join('\n')}
        </pre>
        
        {shouldTruncate && !expanded && (
          <div className="mt-4 text-center border-t border-gray-700 pt-4">
            <p className="text-sm text-gray-400 mb-2">
              Showing {TRUNCATE_LINES} of {lines.length} lines
            </p>
            <button
              onClick={() => setExpanded(true)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Show More ({lines.length - TRUNCATE_LINES} more lines)
            </button>
          </div>
        )}
        
        {shouldTruncate && expanded && (
          <div className="mt-4 text-center border-t border-gray-700 pt-4">
            <button
              onClick={() => setExpanded(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Show Less
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-blue-600 to-blue-800 text-white">
          <div>
            <h2 className="text-lg font-semibold font-mono">{func.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-blue-100">
                {func.visibility} {func.isEntry && '• Entry'}
              </p>
              <span className="text-xs px-2 py-0.5 rounded bg-purple-500/30 text-purple-100 border border-purple-400">
                🔮 Decompiled by SuiGPT
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!disassembly}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy to clipboard"
            >
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl leading-none font-bold"
          >
            ×
          </button>
        </div>
          </div>

        {/* Disassembly Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-8 text-center">
              <div className="text-gray-500">Loading disassembly...</div>
            </div>
          )}

          {error && (
            <div className="p-8">
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
          </div>
            </div>
          )}

          {!loading && !error && disassembly && (
            <div className="p-4">
              {/* Source Code Block */}
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                {renderBytecode()}
              </div>

              {/* Function Calls */}
              {disassembly.calls && disassembly.calls.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">
                    Function Calls ({disassembly.calls.length})
                  </h3>
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-3 space-y-2 border border-blue-200">
                    {disassembly.calls.map((call, idx) => (
                      <div key={idx} className="text-sm border-l-4 border-blue-500 pl-3 bg-white/50 p-2 rounded">
                        <div className="font-mono text-gray-900 font-semibold">
                          → {call.module}::<span className="text-blue-700">{call.func}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Constants Detected */}
              {disassembly.constants && disassembly.constants.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">
                    Hardcoded Constants ({disassembly.constants.length})
                  </h3>
                  <div className="bg-yellow-50 rounded-lg p-3 space-y-2">
                    {disassembly.constants.map((constant, idx) => (
                      <div key={idx} className="text-sm border-l-2 border-yellow-500 pl-3">
                        <div className="font-mono text-gray-900">
                          {constant.type}: <span className="text-yellow-700">{constant.value}</span>
                        </div>
                        <div className="text-xs text-gray-500">at offset {constant.offset}</div>
                      </div>
                    ))}
                  </div>
              </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
