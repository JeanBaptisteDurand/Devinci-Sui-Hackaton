import { useEffect, useState } from 'react';

interface ExplanationModalProps {
  type: 'module' | 'package';
  id: string;
  name: string;
  onClose: () => void;
}

export default function ExplanationModal({ type, id, name, onClose }: ExplanationModalProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchExplanation();
  }, [type, id]);

  const fetchExplanation = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Try to get existing explanation from the API
      const endpoint = type === 'module' 
        ? `/api/modules/${id}` 
        : `/api/packages/${id}`;
      
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${type} data`);
      }
      
      const data = await response.json();
      
      if (data.explanation) {
        setExplanation(data.explanation);
      } else {
        setExplanation(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load explanation');
    } finally {
      setLoading(false);
    }
  };

  const generateExplanation = async (force: boolean = false) => {
    setGenerating(true);
    setError(null);
    
    try {
      const endpoint = type === 'module'
        ? `/api/modules/${id}/generate-explanation`
        : `/api/packages/${id}/generate-explanation`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to generate explanation`);
      }
      
      const data = await response.json();
      setExplanation(data.explanation);
    } catch (err: any) {
      setError(err.message || 'Failed to generate explanation');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              {type === 'module' ? '📦 Module' : '🎯 Package'} Explanation
            </h2>
            <p className="text-sm text-gray-600 mt-1 font-mono">{name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading explanation...</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 font-medium">❌ Error</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          ) : explanation ? (
            <div className="prose prose-sm max-w-none">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                  {explanation}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🤖</div>
              <p className="text-gray-600 mb-6">
                No explanation available yet. Generate one using AI?
              </p>
              <button
                onClick={() => generateExplanation(false)}
                disabled={generating}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <span className="inline-block animate-spin mr-2">⏳</span>
                    Generating...
                  </>
                ) : (
                  '✨ Generate Explanation'
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {explanation && (
          <div className="border-t border-gray-200 p-4 bg-gray-50 flex justify-between items-center">
            <button
              onClick={() => generateExplanation(true)}
              disabled={generating}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? 'Regenerating...' : '🔄 Regenerate'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

