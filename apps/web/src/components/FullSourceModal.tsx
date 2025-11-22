import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { logger } from '../utils/logger';

interface FullSourceModalProps {
  moduleName: string; // Full module FQN like "0xP::m"
  moduleDisplayName: string; // Short name for display
  onClose: () => void;
}

export default function FullSourceModal({ moduleName, moduleDisplayName, onClose }: FullSourceModalProps) {
  const { id: analysisId } = useParams<{ id: string }>();
  const [sourceCode, setSourceCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchFullSource();
  }, [analysisId, moduleName]);

  const fetchFullSource = async () => {
    if (!analysisId) {
      setError('Analysis ID not found');
      setLoading(false);
      return;
    }

    try {
      logger.info('FullSourceModal', `Fetching full source code for ${moduleName}`);
      
      const url = `/api/analysis/${analysisId}/source/${encodeURIComponent(moduleName)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch source code: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('FullSourceModal', 'Full source code fetched successfully', data);
      
      setSourceCode(data.sourceCode || '');
    } catch (err: any) {
      logger.error('FullSourceModal', 'Failed to fetch full source code', { error: err.message });
      setError(err.message || 'Failed to load source code');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sourceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('FullSourceModal', 'Failed to copy to clipboard', { error: err });
    }
  };

  const renderSourceCode = () => {
    if (!sourceCode) {
      return <p className="text-gray-400 text-sm">No source code available</p>;
    }

    return (
      <pre className="text-sm overflow-x-auto">
        <code className="text-green-400 font-mono whitespace-pre">
          {sourceCode}
        </code>
      </pre>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-purple-600 to-purple-800 text-white">
          <div>
            <h2 className="text-lg font-semibold font-mono">{moduleDisplayName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-purple-100">Full Module Source Code</p>
              <span className="text-xs px-2 py-0.5 rounded bg-purple-500/30 text-purple-100 border border-purple-400">
                🔮 Decompiled by SuiGPT
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-purple-500 hover:bg-purple-400 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              {copied ? (
                <>
                  <span>✓</span>
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <span>📋</span>
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="text-white hover:text-purple-200 transition-colors text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm font-semibold">Error loading source code</p>
              <p className="text-red-600 text-xs mt-1">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <div>
              {/* Source Code Block */}
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                {renderSourceCode()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

