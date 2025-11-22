import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { NodeProps } from 'reactflow';

interface PackageNodeData {
  label: string;
  address: string;
  displayName?: string;
  isPrimary?: boolean;
  stats?: {
    modules?: number;
    types?: number;
    recentEvents?: number;
  };
}

function PackageNode({ data }: NodeProps<PackageNodeData>) {
  const displayLabel = data.displayName || data.address;
  
  // Always prefer displayName over address for display
  const shortLabel = displayLabel.length > 20 
    ? `${displayLabel.slice(0, 8)}...${displayLabel.slice(-6)}`
    : displayLabel;

  // Determine colors based on primary status
  const bgColor = data.isPrimary ? 'bg-yellow-400' : 'bg-blue-500';
  const borderColor = data.isPrimary ? 'border-yellow-600' : 'border-blue-700';
  const textColor = data.isPrimary ? 'text-gray-900' : 'text-white';
  const statsColor = data.isPrimary ? 'text-gray-700' : 'text-blue-100';

  return (
    <div className={`px-6 py-4 shadow-xl rounded-full ${bgColor} border-3 ${borderColor} ${textColor} min-w-[180px] max-w-[280px]`}>
      <Handle type="target" position={Position.Top} className="w-4 h-4" />
      
      <div className="flex flex-col items-center gap-1.5">
        {data.isPrimary && (
          <div className="text-xs font-bold uppercase tracking-wider mb-1 text-gray-700">
            Primary
          </div>
        )}
        <div className="font-bold text-lg break-all text-center">
          {shortLabel}
        </div>
        
        {data.stats && (
          <div className={`flex gap-3 text-sm ${statsColor} font-medium`}>
            {data.stats.modules !== undefined && (
              <span>{data.stats.modules}M</span>
            )}
            {data.stats.types !== undefined && (
              <span>{data.stats.types}T</span>
            )}
            {data.stats.recentEvents !== undefined && (
              <span>{data.stats.recentEvents}E</span>
            )}
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-4 h-4" />
    </div>
  );
}

export default memo(PackageNode);

