import { useEffect, useState } from 'react';

interface ObjectsModalProps {
  typeFqn: string;
  analysisId: string;
  onClose: () => void;
}

interface ObjectData {
  id: string;
  objectId: string;
  typeFqn: string;
  owner: {
    kind: string;
    address?: string;
  };
  shared: boolean;
  version?: string;
  digest?: string;
  snapshot?: any;
}

export default function ObjectsModal({ typeFqn, analysisId, onClose }: ObjectsModalProps) {
  const [objects, setObjects] = useState<ObjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<ObjectData | null>(null);
  const [network, setNetwork] = useState<string>('mainnet');

  // Fetch network info on mount
  useEffect(() => {
    const fetchNetwork = async () => {
      try {
        const response = await fetch(`/api/analysis/${analysisId}`);
        if (response.ok) {
          const data = await response.json();
          if (data._metadata?.network) {
            setNetwork(data._metadata.network);
          }
        }
      } catch (error) {
        console.error('Failed to fetch network info:', error);
      }
    };
    fetchNetwork();
  }, [analysisId]);

  useEffect(() => {
    fetchObjects();
  }, [typeFqn, analysisId]);

  const fetchObjects = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `/api/analysis/${analysisId}/type/${encodeURIComponent(typeFqn)}/objects?limit=50`
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch objects: ${errorText}`);
      }
      
      const data = await response.json();
      
      // Update network if returned from API (fallback network)
      if (data.network) {
        setNetwork(data.network);
      }
      
      if (data.message) {
        setError(data.message);
      } else if (!data.objects || data.objects.length === 0) {
        setError('No objects found for this type');
      } else {
        setObjects(data.objects);
      }
    } catch (err: any) {
      console.error('Failed to fetch objects:', err);
      setError(err.message || 'Failed to load objects');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-card rounded-lg shadow-2xl max-w-6xl w-full mx-4 max-h-[85vh] overflow-hidden flex border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Panel: Object List */}
        <div className="w-1/2 border-r border-border flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">Objects</h2>
              <span className={`px-2 py-1 text-xs font-bold rounded ${
                network === 'mainnet' ? 'bg-green-500' :
                network === 'testnet' ? 'bg-yellow-500' :
                'bg-purple-500'
              }`}>
                {network.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-blue-100 mt-1 truncate" title={typeFqn}>
              {typeFqn.split('::').pop()}
            </p>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : error ? (
              <div className="text-center py-8 px-4">
                {network !== 'mainnet' ? (
                  // Special UI for non-mainnet networks
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6">
                    <svg className="w-12 h-12 text-blue-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300 mb-2">GraphQL Not Available</h3>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">
                      Object fetching via GraphQL is currently only available on <strong>mainnet</strong>.
                    </p>
                    <p className="text-xs text-blue-500 dark:text-blue-400">
                      This package was analyzed on <span className="font-bold">{network.toUpperCase()}</span>, where GraphQL queries are not yet supported.
                    </p>
                  </div>
                ) : (
                  // Regular error UI
                  <>
                    <svg className="w-16 h-16 text-muted-foreground mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-muted-foreground">{error}</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {objects.map((obj) => (
                  <div
                    key={obj.objectId}
                    onClick={() => setSelectedObject(obj)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedObject?.objectId === obj.objectId
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-border hover:border-blue-500/50 hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <code className="text-xs text-foreground break-all font-mono">
                          {obj.objectId}
                        </code>
                        <div className="flex gap-2 mt-2">
                          {obj.shared ? (
                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-700 dark:text-purple-300 text-xs rounded">
                              Shared
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-700 dark:text-green-300 text-xs rounded">
                              Owned
                            </span>
                          )}
                          {obj.owner.kind === 'Immutable' && (
                            <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded">
                              Immutable
                            </span>
                          )}
                        </div>
                      </div>
                      <svg 
                        className="w-5 h-5 text-muted-foreground flex-shrink-0" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-muted/50 px-6 py-3 border-t border-border">
            <div className="text-sm text-muted-foreground">
              {loading ? 'Loading...' : error ? 'No objects' : `${objects.length} object(s)`}
            </div>
          </div>
        </div>

        {/* Right Panel: Object Details */}
        <div className="w-1/2 flex flex-col">
          {/* Header */}
          <div className="bg-muted/30 px-6 py-4 flex justify-between items-center border-b border-border">
            <h2 className="text-lg font-bold text-foreground">
              {selectedObject ? 'Object Details' : 'Select an object'}
            </h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-2xl font-bold"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedObject ? (
              <div className="space-y-4">
                {/* Object ID */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Object ID
                  </h3>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm break-all text-foreground">
                      {selectedObject.objectId}
                    </code>
                    <button
                      onClick={() => copyToClipboard(selectedObject.objectId)}
                      className="px-3 py-2 bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-500/30 transition-colors text-sm"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {/* Owner */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Owner
                  </h3>
                  <div className="bg-muted px-3 py-2 rounded">
                    <div className="text-sm font-medium text-foreground mb-1">
                      {selectedObject.owner.kind}
                    </div>
                    {selectedObject.owner.address && (
                      <code className="text-xs text-muted-foreground break-all">
                        {selectedObject.owner.address}
                      </code>
                    )}
                  </div>
                </div>

                {/* Version & Digest */}
                <div className="grid grid-cols-2 gap-4">
                  {selectedObject.version && (
                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                        Version
                      </h3>
                      <div className="bg-muted px-3 py-2 rounded text-sm text-foreground">
                        {selectedObject.version}
                      </div>
                    </div>
                  )}
                  {selectedObject.digest && (
                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                        Digest
                      </h3>
                      <div className="bg-muted px-3 py-2 rounded text-xs text-foreground truncate" title={selectedObject.digest}>
                        {selectedObject.digest}
                      </div>
                    </div>
                  )}
                </div>

                {/* Snapshot/Content */}
                {selectedObject.snapshot && Object.keys(selectedObject.snapshot).length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Content
                    </h3>
                    <div className="bg-slate-950 text-slate-50 px-4 py-3 rounded overflow-x-auto border border-border">
                      <pre className="text-xs">
                        {JSON.stringify(selectedObject.snapshot, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  <p className="text-sm">Select an object to view details</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-muted/50 px-6 py-3 border-t border-border flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

