import { Edge as FlowEdge } from 'reactflow';

interface EdgePanelProps {
  edge: FlowEdge;
  onClose: () => void;
}

export default function EdgePanel({ edge, onClose }: EdgePanelProps) {
  const edgeData = edge.data as any;
  const evidence = edgeData?.evidence;

  const edgeKindColors: Record<string, string> = {
    PKG_CONTAINS: 'bg-green-100 text-green-800',
    PKG_DEPENDS: 'bg-gray-100 text-gray-800',
    MOD_CALLS: 'bg-blue-100 text-blue-800',
    MOD_DEFINES_TYPE: 'bg-violet-100 text-violet-800',
    TYPE_USES_TYPE: 'bg-pink-100 text-pink-800',
    MOD_FRIEND_ALLOW: 'bg-orange-100 text-orange-800',
    OBJ_INSTANCE_OF: 'bg-gray-100 text-gray-700',
    OBJ_OWNED_BY: 'bg-amber-100 text-amber-800',
    OBJ_DF_CHILD: 'bg-gray-200 text-gray-800',
    OBJ_REFERS_OBJ: 'bg-slate-100 text-slate-800',
    MOD_EMITS_EVENT: 'bg-yellow-100 text-yellow-800',
    PKG_EMITS_EVENT: 'bg-yellow-100 text-yellow-800',
  };

  const colorClass = edgeKindColors[edgeData?.kind] || 'bg-gray-100 text-gray-800';

  return (
    <div className="w-96 h-full bg-white shadow-2xl border-l border-gray-200 overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Edge Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Edge Kind Badge */}
        <div className="mb-6">
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${colorClass}`}>
            {edgeData?.kind || 'Unknown'}
          </span>
        </div>

        {/* Source and Target */}
        <div className="space-y-4 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">From</h3>
            <div className="font-mono text-sm text-gray-800 break-all bg-gray-50 p-2 rounded">
              {edge.source}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">To</h3>
            <div className="font-mono text-sm text-gray-800 break-all bg-gray-50 p-2 rounded">
              {edge.target}
            </div>
          </div>
        </div>

        {/* Evidence (if available) */}
        {evidence && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Evidence</h3>
            
            {/* MOD_CALLS evidence */}
            {evidence.kind === 'MOD_CALLS' && evidence.calls && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-2">
                  {evidence.calls.length} call{evidence.calls.length !== 1 ? 's' : ''} detected
                </p>
                {evidence.calls.map((call: any, idx: number) => (
                  <div key={idx} className="bg-blue-50 p-3 rounded border border-blue-200">
                    <div className="space-y-1">
                      {call.calleeModule && call.calleeFunc && (
                        <div className="font-mono text-sm text-gray-900">
                          <span className="text-gray-600">→</span> {call.calleeModule}::<span className="text-blue-700 font-semibold">{call.calleeFunc}</span>
                        </div>
                      )}
                      {call.callerFunc && (
                        <div className="text-xs text-gray-600">
                          from: <span className="font-mono">{call.callerFunc}</span>
                    </div>
                      )}
                    {call.viaType && (
                        <div className="text-xs text-gray-600">
                          via type: <span className="font-mono">{call.viaType}</span>
                        </div>
                      )}
                      {call.viaFunction && (
                        <div className="text-xs text-gray-600">
                          via function: <span className="font-mono">{call.viaFunction}</span>
                      </div>
                    )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PKG_DEPENDS evidence */}
            {evidence.kind === 'PKG_DEPENDS' && evidence.evidence && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-2">
                  {evidence.evidence.length} dependency reference{evidence.evidence.length !== 1 ? 's' : ''}
                </p>
                {evidence.evidence.map((ev: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
                    <div className="font-mono text-xs text-gray-700 break-all">
                      {ev.module}
                    </div>
                    {ev.function && (
                      <div className="text-xs text-gray-600 mt-1">
                        in function: {ev.function}
                      </div>
                    )}
                    {ev.typeFqn && (
                      <div className="text-xs text-gray-600 mt-1">
                        uses type: {ev.typeFqn}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* General evidence display */}
            {!['MOD_CALLS', 'PKG_DEPENDS'].includes(evidence.kind) && (
              <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto border border-gray-200">
                {JSON.stringify(evidence, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Edge Description */}
        <div className="mt-6 p-4 bg-blue-50 rounded border border-blue-200">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">What this means:</h3>
          <p className="text-sm text-blue-800">
            {getEdgeDescription(edgeData?.kind)}
          </p>
        </div>
      </div>
    </div>
  );
}

function getEdgeDescription(kind: string): string {
  const descriptions: Record<string, string> = {
    PKG_CONTAINS: 'This package contains this module as part of its codebase.',
    PKG_DEPENDS: 'This package depends on another package and uses its types/functions.',
    MOD_CALLS: 'This module calls functions or uses types from another module.',
    MOD_DEFINES_TYPE: 'This module defines this struct type.',
    TYPE_USES_TYPE: 'Struct composition: this type contains another type as a field.',
    MOD_FRIEND_ALLOW: 'This module grants friend access to another module (privileged calls).',
    OBJ_INSTANCE_OF: 'This on-chain object is an instance of this type.',
    OBJ_OWNED_BY: 'This object is owned by this address.',
    OBJ_DF_CHILD: 'Dynamic field child: this object is a child of another object via getDynamicFields.',
    OBJ_REFERS_OBJ: 'Snapshot reference: this object references another object ID in its fields.',
    MOD_EMITS_EVENT: 'This module emitted this event.',
    PKG_EMITS_EVENT: 'This package emitted this event.',
  };
  return descriptions[kind] || 'This edge represents a relationship between two nodes.';
}

