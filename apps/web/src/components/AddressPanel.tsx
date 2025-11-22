interface AddressPanelProps {
  node: any;
  graphData: any;
  onClose: () => void;
}

export default function AddressPanel({ node, graphData, onClose }: AddressPanelProps) {
  const address = node.data?.address || '';
  const addressId = node.id;

  // Find objects owned by this address
  const ownedObjects = graphData?.edges
    ?.filter((edge: any) => edge.kind === 'OBJ_OWNED_BY' && edge.to === addressId)
    .map((edge: any) => {
      const objNode = graphData?.objects?.find((obj: any) => obj.id === edge.from);
      return objNode;
    })
    .filter(Boolean) || [];

  return (
    <div className="w-96 h-full bg-white shadow-2xl border-l border-gray-200 overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Address Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Address */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Address</h3>
          <div className="font-mono text-xs text-gray-800 break-all bg-amber-50 p-3 rounded border border-amber-200">
            {address}
          </div>
        </div>

        {/* Copy Button */}
        <button
          onClick={() => navigator.clipboard.writeText(address)}
          className="w-full mb-6 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded transition-colors"
        >
          📋 Copy Address
        </button>

        {/* Owned Objects */}
        {ownedObjects.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">
              Owned Objects ({ownedObjects.length})
            </h3>
            <div className="space-y-2">
              {ownedObjects.map((obj: any, idx: number) => (
                <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
                  <div className="font-mono text-xs text-gray-700 break-all">
                    {obj.objectId}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Type: {obj.typeFqn?.split('::').pop() || 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {ownedObjects.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No owned objects found in this analysis.
          </div>
        )}

        {/* Info */}
        <div className="mt-6 p-4 bg-amber-50 rounded border border-amber-200">
          <p className="text-sm text-amber-800">
            This address owns {ownedObjects.length} object{ownedObjects.length !== 1 ? 's' : ''} discovered in this analysis.
          </p>
        </div>
      </div>
    </div>
  );
}

