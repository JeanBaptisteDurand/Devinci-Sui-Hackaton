import { useState, useEffect } from 'react';
import { suiscanObjectUrl, suivisionObjectUrl } from '../utils/explorers';

interface ObjectPanelProps {
  node: any;
  analysisId: string;
  onClose: () => void;
}

export default function ObjectPanel({ node, analysisId, onClose }: ObjectPanelProps) {
  const [objectDetails, setObjectDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const objectId = node.data?.objectId || '';

  useEffect(() => {
    if (objectId && analysisId) {
      fetchObjectDetails();
    }
  }, [objectId, analysisId]);

  const fetchObjectDetails = async () => {
    try {
      const response = await fetch(`/api/analysis/${analysisId}/object/${objectId}`);
      if (response.ok) {
        const data = await response.json();
        setObjectDetails(data);
      }
    } catch (error) {
      console.error('Failed to fetch object details:', error);
    } finally {
      setLoading(false);
    }
  };

  const object = objectDetails?.object;
  const parents = objectDetails?.parents || [];
  const children = objectDetails?.children || [];
  const flags = objectDetails?.flags || [];

  return (
    <div className="w-96 h-full bg-white shadow-2xl border-l border-gray-200 overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Object Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : (
          <>
            {/* Object ID */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Object ID</h3>
              <div className="font-mono text-xs text-gray-800 break-all bg-gray-50 p-2 rounded">
                {objectId}
              </div>
            </div>

            {/* Owner Info */}
            {object?.owner && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Owner</h3>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    object.owner.kind === 'Shared' 
                      ? 'bg-yellow-100 text-yellow-800'
                      : object.owner.kind === 'Immutable'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {object.owner.kind}
                  </span>
                </div>
                {object.owner.address && (
                  <div className="font-mono text-xs text-gray-600 break-all bg-gray-50 p-2 rounded mt-2">
                    {object.owner.address}
                  </div>
                )}
              </div>
            )}

            {/* Type */}
            {object?.typeFqn && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Type</h3>
                <div className="font-mono text-xs text-gray-700 break-all bg-violet-50 p-2 rounded border border-violet-200">
                  {object.typeFqn}
                </div>
              </div>
            )}

            {/* Flags */}
            {flags.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Security Flags</h3>
                <div className="space-y-2">
                  {flags.map((flag: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3 rounded border ${
                        flag.level === 'HIGH'
                          ? 'bg-red-50 border-red-200 text-red-800'
                          : flag.level === 'MED'
                          ? 'bg-orange-50 border-orange-200 text-orange-800'
                          : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                      }`}
                    >
                      <div className="font-semibold text-sm">{flag.kind}</div>
                      <div className="text-xs mt-1">{flag.details?.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parents (Dynamic Field) */}
            {parents.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">
                  Parent Objects ({parents.length})
                </h3>
                <div className="space-y-2">
                  {parents.map((parentId: string, idx: number) => (
                    <div key={idx} className="font-mono text-xs text-gray-700 bg-gray-50 p-2 rounded break-all">
                      {parentId}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Children (Dynamic Fields) */}
            {children.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">
                  Child Objects ({children.length})
                </h3>
                <div className="space-y-2">
                  {children.map((childId: string, idx: number) => (
                    <div key={idx} className="font-mono text-xs text-gray-700 bg-gray-50 p-2 rounded break-all">
                      {childId}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Explorer Links */}
            <div className="mt-6 space-y-2">
              <a
                href={suiscanObjectUrl(objectId)}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-4 py-2 bg-blue-500 text-white text-center rounded hover:bg-blue-600 transition-colors"
              >
                View on SuiScan
              </a>
              <a
                href={suivisionObjectUrl(objectId)}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-4 py-2 bg-green-500 text-white text-center rounded hover:bg-green-600 transition-colors"
              >
                View on SuiVision
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

