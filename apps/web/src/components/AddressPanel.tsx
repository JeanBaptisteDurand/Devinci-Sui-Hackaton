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
    <div className="w-96 h-full bg-card shadow-2xl border-l border-border overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-foreground">Address Details</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Address */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Address</h3>
          <div className="font-mono text-xs text-foreground break-all bg-amber-500/10 p-3 rounded border border-amber-500/20">
            {address}
          </div>
        </div>

        {/* Copy Button */}
        <button
          onClick={() => navigator.clipboard.writeText(address)}
          className="w-full mb-6 px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded transition-colors"
        >
          📋 Copy Address
        </button>

        {/* Owned Objects */}
        {ownedObjects.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
              Owned Objects ({ownedObjects.length})
            </h3>
            <div className="space-y-2">
              {ownedObjects.map((obj: any, idx: number) => (
                <div key={idx} className="bg-muted/50 p-3 rounded border border-border">
                  <div className="font-mono text-xs text-foreground break-all">
                    {obj.objectId}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Type: {obj.typeFqn?.split('::').pop() || 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {ownedObjects.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No owned objects found in this analysis.
          </div>
        )}

        {/* Info */}
        <div className="mt-6 p-4 bg-amber-500/10 rounded border border-amber-500/20">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            This address owns {ownedObjects.length} object{ownedObjects.length !== 1 ? 's' : ''} discovered in this analysis.
          </p>
        </div>
      </div>
    </div>
  );
}

