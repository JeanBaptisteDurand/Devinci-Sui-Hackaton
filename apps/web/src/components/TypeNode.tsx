import { memo } from 'react';
import { Handle, Position } from 'reactflow';

interface TypeNodeProps {
  data: {
    label: string;
    typeFqn: string;
    hasKey?: boolean;
    fieldsCount?: number;
  };
}

function TypeNode({ data }: TypeNodeProps) {
  return (
    <div className="px-2 py-1.5 shadow-sm rounded-md bg-violet-100 border border-violet-400 min-w-[80px] max-w-[100px]">
      <Handle type="target" position={Position.Top} className="w-1.5 h-1.5" />
      
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold text-violet-700">Type</span>
          {data.hasKey && (
            <span className="px-1 py-0.5 text-[8px] font-mono bg-violet-300 text-violet-800 rounded">
              key
            </span>
          )}
        </div>
        
        <div className="font-mono text-xs text-gray-800 font-medium break-all">
          {data.label}
        </div>
        
        {data.fieldsCount !== undefined && data.fieldsCount > 0 && (
          <div className="text-[10px] text-violet-600">
            {data.fieldsCount}f
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-1.5 h-1.5" />
    </div>
  );
}

export default memo(TypeNode);

