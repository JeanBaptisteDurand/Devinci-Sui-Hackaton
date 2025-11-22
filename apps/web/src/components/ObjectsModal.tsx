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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl max-w-6xl w-full mx-4 max-h-[85vh] overflow-hidden flex"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Panel: Object List */}
        <div className="w-1/2 border-r border-gray-200 flex flex-col">
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
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <svg className="w-12 h-12 text-blue-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-blue-900 mb-2">GraphQL Not Available</h3>
                    <p className="text-sm text-blue-800 mb-3">
                      Object fetching via GraphQL is currently only available on <strong>mainnet</strong>.
                    </p>
                    <p className="text-xs text-blue-700">
                      This package was analyzed on <span className="font-bold">{network.toUpperCase()}</span>, where GraphQL queries are not yet supported.
                    </p>
                  </div>
                ) : (
                  // Regular error UI
                  <>
                    <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-gray-600">{error}</p>
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
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <code className="text-xs text-gray-700 break-all font-mono">
                          {obj.objectId}
                        </code>
                        <div className="flex gap-2 mt-2">
                          {obj.shared ? (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                              Shared
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                              Owned
                            </span>
                          )}
                          {obj.owner.kind === 'Immutable' && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                              Immutable
                            </span>
                          )}
                        </div>
                      </div>
                      <svg 
                        className="w-5 h-5 text-gray-400 flex-shrink-0" 
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
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              {loading ? 'Loading...' : error ? 'No objects' : `${objects.length} object(s)`}
            </div>
          </div>
        </div>

        {/* Right Panel: Object Details */}
        <div className="w-1/2 flex flex-col">
          {/* Header */}
          <div className="bg-gray-100 px-6 py-4 flex justify-between items-center border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-700">
              {selectedObject ? 'Object Details' : 'Select an object'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
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
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    Object ID
                  </h3>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm break-all">
                      {selectedObject.objectId}
                    </code>
                    <button
                      onClick={() => copyToClipboard(selectedObject.objectId)}
                      className="px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors text-sm"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {/* Owner */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    Owner
                  </h3>
                  <div className="bg-gray-100 px-3 py-2 rounded">
                    <div className="text-sm font-medium text-gray-700 mb-1">
                      {selectedObject.owner.kind}
                    </div>
                    {selectedObject.owner.address && (
                      <code className="text-xs text-gray-600 break-all">
                        {selectedObject.owner.address}
                      </code>
                    )}
                  </div>
                </div>

                {/* Version & Digest */}
                <div className="grid grid-cols-2 gap-4">
                  {selectedObject.version && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        Version
                      </h3>
                      <div className="bg-gray-100 px-3 py-2 rounded text-sm text-gray-700">
                        {selectedObject.version}
                      </div>
                    </div>
                  )}
                  {selectedObject.digest && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        Digest
                      </h3>
                      <div className="bg-gray-100 px-3 py-2 rounded text-xs text-gray-700 truncate" title={selectedObject.digest}>
                        {selectedObject.digest}
                      </div>
                    </div>
                  )}
                </div>

                {/* Snapshot/Content */}
                {selectedObject.snapshot && Object.keys(selectedObject.snapshot).length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                      Content
                    </h3>
                    <div className="bg-gray-900 text-gray-100 px-4 py-3 rounded overflow-x-auto">
                      <pre className="text-xs">
                        {JSON.stringify(selectedObject.snapshot, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
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
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

