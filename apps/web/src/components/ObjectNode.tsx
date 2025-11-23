import { memo } from 'react';
import { Handle, Position } from 'reactflow';

interface ObjectNodeProps {
  data: {
    label: string;
    objectId: string;
    shared?: boolean;
    ownerKind?: string;
  };
}

function ObjectNode({ data }: ObjectNodeProps) {
  return (
    <div className="px-2.5 py-1.5 shadow-sm rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-400 dark:border-gray-600 min-w-[100px] max-w-[150px]">
      <Handle type="target" position={Position.Top} className="w-1.5 h-1.5" />
      
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase">Obj</span>
          {data.shared && (
            <span className="px-1 py-0.5 text-[9px] font-mono bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded">
              shared
            </span>
          )}
        </div>
        
        <div className="font-mono text-[11px] text-gray-700 dark:text-gray-300 truncate max-w-full text-center">
          {data.label}
        </div>
        
        {data.ownerKind && !data.shared && (
          <div className="text-[9px] text-gray-500 dark:text-gray-500">
            {data.ownerKind}
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-1.5 h-1.5" />
    </div>
  );
}

export default memo(ObjectNode);

