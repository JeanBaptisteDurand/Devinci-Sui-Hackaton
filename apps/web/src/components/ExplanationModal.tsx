import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ExplanationModalProps {
  type: 'module' | 'package';
  id: string;
  name: string;
  onClose: () => void;
  hasModules?: boolean; // For packages: true if package has modules, false if it's depth level 3
}

const MarkdownComponents = {
  p: ({node, ...props}: any) => <p className="text-sm leading-relaxed break-words mb-2 last:mb-0" {...props} />,
  a: ({node, ...props}: any) => <a className="underline hover:no-underline break-all text-primary" target="_blank" rel="noopener noreferrer" {...props} />,
  ul: ({node, ...props}: any) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
  ol: ({node, ...props}: any) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
  li: ({node, ...props}: any) => <li className="text-sm" {...props} />,
  h1: ({node, ...props}: any) => <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0" {...props} />,
  h2: ({node, ...props}: any) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0" {...props} />,
  h3: ({node, ...props}: any) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0" {...props} />,
  code: ({node, inline, className, children, ...props}: any) => {
    return inline ? (
      <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono break-all" {...props}>
        {children}
      </code>
    ) : (
      <pre className="bg-muted p-2 rounded-lg overflow-x-auto text-xs font-mono mb-2">
        <code {...props}>{children}</code>
      </pre>
    );
  },
  blockquote: ({node, ...props}: any) => <blockquote className="border-l-4 border-primary/50 pl-4 italic my-2 opacity-80" {...props} />,
  table: ({node, ...props}: any) => <div className="overflow-x-auto mb-2"><table className="min-w-full divide-y divide-border border-border border opacity-80" {...props} /></div>,
  th: ({node, ...props}: any) => <th className="px-3 py-2 bg-muted text-left text-xs font-medium uppercase tracking-wider border-b border-border opacity-70" {...props} />,
  td: ({node, ...props}: any) => <td className="px-3 py-2 whitespace-nowrap text-sm border-b border-border opacity-90" {...props} />,
};

export default function ExplanationModal({ type, id, name, onClose, hasModules }: ExplanationModalProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    // Skip fetching if it's a package with no modules (depth level 3)
    if (type === 'package' && hasModules === false) {
      setLoading(false);
      return;
    }
    fetchExplanation();
  }, [type, id, hasModules]);

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {type === 'module' ? '📦 Module' : '🎯 Package'} Explanation
            </h2>
            <p className="text-sm text-muted-foreground mt-1 font-mono">{name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-3xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-card">
          {type === 'package' && hasModules === false ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📦</div>
              <p className="text-muted-foreground text-lg font-medium">
                Not analyzed, dependency of a dependency.
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading explanation...</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-destructive font-medium">❌ Error</p>
              <p className="text-destructive/80 text-sm mt-1">{error}</p>
            </div>
          ) : explanation ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <div className="bg-muted/30 border border-border rounded-lg p-6">
                <div className="whitespace-pre-wrap text-foreground leading-relaxed">
                  <ReactMarkdown components={MarkdownComponents} remarkPlugins={[remarkGfm]}>
                    {explanation}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🤖</div>
              <p className="text-muted-foreground mb-6">
                No explanation available yet. Generate one using AI?
              </p>
              <button
                onClick={() => generateExplanation(false)}
                disabled={generating}
                className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="border-t border-border p-4 bg-muted/50 flex justify-between items-center">
            <button
              onClick={() => generateExplanation(true)}
              disabled={generating}
              className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? 'Regenerating...' : '🔄 Regenerate'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

