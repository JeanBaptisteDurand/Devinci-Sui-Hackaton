import { useEffect, useState } from 'react';
import ObjectsModal from './ObjectsModal';

interface TypeModalProps {
  typeFqn: string;
  analysisId: string;
  onClose: () => void;
}

interface TypeDetails {
  type: {
    fqn: string;
    hasKey: boolean;
    abilities?: string[];
    fields?: Array<{ name: string; type: string }>;
  };
  definedBy: string;
  usesTypes?: string[]; // Types that THIS type uses
  stats?: {
    count?: number;
    owners?: number;
    sampled?: number;
    shared?: number;
  };
  samples?: string[];
}

export default function TypeModal({ typeFqn, analysisId, onClose }: TypeModalProps) {
  const [typeDetails, setTypeDetails] = useState<TypeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showObjectsModal, setShowObjectsModal] = useState(false);

  useEffect(() => {
    fetchTypeDetails();
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

  const handleViewObjects = () => {
    // Simply check hasKey flag
    if (!typeDetails?.type.hasKey) {
      alert('This type does not have the "key" ability and cannot have on-chain object instances.');
      return;
    }
    setShowObjectsModal(true);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-card rounded-lg shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col overflow-hidden border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-primary text-primary-foreground px-6 py-4 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold">Type Details</h2>
          <button
            onClick={onClose}
            className="text-primary-foreground hover:text-primary-foreground/80 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content - scrollable area */}
        <div className="p-6 overflow-y-auto flex-1 bg-card">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : typeDetails ? (
            <div className="space-y-6">
              {/* FQN */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">
                  Fully Qualified Name
                </h3>
                <code className="block bg-muted px-3 py-2 rounded text-sm break-all text-foreground">
                  {typeDetails.type.fqn}
                </code>
              </div>

              {/* Abilities & Badges */}
              <div className="flex flex-wrap gap-2">
                {typeDetails.type.hasKey && (
                  <span className="px-3 py-1 bg-green-500/20 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                    has key
                  </span>
                )}
                {typeDetails.type.abilities?.map((ability) => (
                  <span
                    key={ability}
                    className="px-3 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium"
                  >
                    {ability}
                  </span>
                ))}
              </div>

              {/* Defined By */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">
                  Defined By Module
                </h3>
                <code className="block bg-muted px-3 py-2 rounded text-sm text-foreground">
                  {typeDetails.definedBy}
                </code>
              </div>

              {/* Types Used (Child types that this type uses) */}
              {typeDetails.usesTypes && typeDetails.usesTypes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">
                    Types Used ({typeDetails.usesTypes.length})
                  </h3>
                  <div className="space-y-2">
                    {typeDetails.usesTypes.map((typeFqn, idx) => (
                      <div key={idx} className="bg-pink-500/10 px-3 py-2 rounded border border-pink-500/30">
                        <code className="text-xs text-pink-700 dark:text-pink-300 font-mono break-all">
                          {typeFqn}
                        </code>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    These types are used as fields in this type (struct composition)
                  </p>
                </div>
              )}

              {/* Fields */}
              {typeDetails.type.fields && typeDetails.type.fields.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">
                    Fields ({typeDetails.type.fields.length})
                  </h3>
                  <div className="bg-muted/50 rounded-lg overflow-hidden border border-border">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-muted-foreground">
                            Name
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-muted-foreground">
                            Type
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {typeDetails.type.fields.map((field, idx) => (
                          <tr key={idx} className="hover:bg-muted/80">
                            <td className="px-4 py-2 text-sm font-mono text-foreground">
                              {field.name}
                            </td>
                            <td className="px-4 py-2 text-sm font-mono text-muted-foreground">
                              {field.type}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Object Discovery Status */}
              {typeDetails.type.hasKey && typeDetails.stats?.count !== undefined && typeDetails.stats.count > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <span><strong>{typeDetails.stats.count}</strong> object(s) found on-chain for this type</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats */}
              {typeDetails.stats && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">
                    On-chain Statistics
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {typeDetails.stats.count !== undefined && (
                      <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {typeDetails.stats.count.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">Total Objects</div>
                      </div>
                    )}
                    {typeDetails.stats.owners !== undefined && (
                      <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {typeDetails.stats.owners.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">Unique Owners</div>
                      </div>
                    )}
                    {typeDetails.stats.shared !== undefined && (
                      <div className="bg-purple-500/10 p-4 rounded-lg border border-purple-500/20">
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {typeDetails.stats.shared.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">Shared Objects</div>
                      </div>
                    )}
                    {typeDetails.stats.sampled !== undefined && (
                      <div className="bg-orange-500/10 p-4 rounded-lg border border-orange-500/20">
                        <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                          {typeDetails.stats.sampled.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">Sampled</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sample Objects */}
              {typeDetails.samples && typeDetails.samples.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">
                    Sample Objects ({typeDetails.samples.length})
                  </h3>
                  <div className="space-y-2">
                    {typeDetails.samples.map((objectId, idx) => (
                      <div key={idx} className="bg-muted px-3 py-2 rounded">
                        <code className="text-xs text-muted-foreground break-all">
                          {objectId}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load type details
            </div>
          )}
        </div>

        {/* Footer - always visible at bottom */}
        <div className="bg-muted/50 px-6 py-4 flex justify-between items-center border-t border-border flex-shrink-0">
          {typeDetails?.type.hasKey && (
            <button
              onClick={handleViewObjects}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors flex items-center gap-2"
              title="View objects of this type"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              View Objects
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors ml-auto"
          >
            Close
          </button>
        </div>
      </div>

      {/* Objects Modal */}
      {showObjectsModal && (
        <ObjectsModal
          typeFqn={typeFqn}
          analysisId={analysisId}
          onClose={() => setShowObjectsModal(false)}
        />
      )}
    </div>
  );
}

