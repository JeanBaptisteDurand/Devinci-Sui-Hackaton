import { useState, useEffect } from 'react';

interface TypePanelProps {
  node: any;
  analysisId: string;
  onClose: () => void;
}

export default function TypePanel({ node, analysisId, onClose }: TypePanelProps) {
  const [typeDetails, setTypeDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const typeFqn = node.data?.typeFqn || '';

  useEffect(() => {
    if (typeFqn && analysisId) {
      fetchTypeDetails();
    }
  }, [typeFqn, analysisId]);

  const fetchTypeDetails = async () => {
    try {
      const response = await fetch(`/api/analysis/${analysisId}/type/${encodeURIComponent(typeFqn)}`);
      if (response.ok) {
        const data = await response.json();
        setTypeDetails(data);
      }
    } catch (error) {
      console.error('Failed to fetch type details:', error);
    } finally {
      setLoading(false);
    }
  };

  const type = typeDetails?.type;
  const stats = typeDetails?.stats;
  const samples = typeDetails?.samples || [];

  return (
    <div className="w-96 h-full bg-card shadow-2xl border-l border-border overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-foreground">Type Details</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <>
            {/* Type Name */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {typeFqn.split('::').pop()}
              </h3>
              <div className="font-mono text-xs text-muted-foreground break-all bg-muted/50 p-2 rounded">
                {typeFqn}
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-6">
              {type?.hasKey && (
                <span className="px-2 py-1 bg-violet-500/20 text-violet-700 dark:text-violet-300 text-xs font-semibold rounded">
                  has key
                </span>
              )}
              {type?.abilities?.map((ability: string) => (
                <span
                  key={ability}
                  className="px-2 py-1 bg-muted text-muted-foreground text-xs font-semibold rounded"
                >
                  {ability.toLowerCase()}
                </span>
              ))}
            </div>

            {/* Fields */}
            {type?.fields && type.fields.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
                  Fields ({type.fields.length})
                </h3>
                <div className="space-y-2">
                  {type.fields.map((field: any, idx: number) => (
                    <div key={idx} className="bg-muted/50 p-3 rounded border border-border">
                      <div className="font-mono text-sm text-foreground">{field.name}</div>
                      <div className="font-mono text-xs text-muted-foreground mt-1">{field.type}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            {stats && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Statistics</h3>
                <div className="grid grid-cols-2 gap-3">
                  {stats.count !== undefined && (
                    <div className="bg-blue-500/10 p-3 rounded">
                      <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Total Objects</div>
                      <div className="text-lg font-bold text-blue-900 dark:text-blue-100">{stats.count}</div>
                    </div>
                  )}
                  {stats.uniqueOwners !== undefined && (
                    <div className="bg-green-500/10 p-3 rounded">
                      <div className="text-xs text-green-600 dark:text-green-400 font-semibold">Unique Owners</div>
                      <div className="text-lg font-bold text-green-900 dark:text-green-100">{stats.uniqueOwners}</div>
                    </div>
                  )}
                  {stats.shared !== undefined && (
                    <div className="bg-yellow-500/10 p-3 rounded">
                      <div className="text-xs text-yellow-600 dark:text-yellow-400 font-semibold">Shared</div>
                      <div className="text-lg font-bold text-yellow-900 dark:text-yellow-100">{stats.shared}</div>
                    </div>
                  )}
                  {stats.sampled !== undefined && (
                    <div className="bg-purple-500/10 p-3 rounded">
                      <div className="text-xs text-purple-600 dark:text-purple-400 font-semibold">Sampled</div>
                      <div className="text-lg font-bold text-purple-900 dark:text-purple-100">{stats.sampled}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sample Objects */}
            {samples.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
                  Sample Objects ({samples.length})
                </h3>
                <div className="space-y-2">
                  {samples.map((objId: string, idx: number) => (
                    <div
                      key={idx}
                      className="font-mono text-xs text-muted-foreground bg-muted/50 p-2 rounded break-all"
                    >
                      {objId}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

