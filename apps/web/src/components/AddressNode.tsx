import { memo } from 'react';
import { Handle, Position } from 'reactflow';

interface AddressNodeProps {
  data: {
    label: string;
    address: string;
  };
}

function AddressNode({ data }: AddressNodeProps) {
  return (
    <div className="px-2.5 py-1.5 shadow-sm rounded bg-amber-100 dark:bg-amber-900/50 border-2 border-amber-400 dark:border-amber-600 min-w-[90px] max-w-[130px]">
      <Handle type="target" position={Position.Top} className="w-1.5 h-1.5" />
      
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase">Address</span>
        <div className="font-mono text-[10px] text-gray-700 dark:text-gray-300 truncate max-w-full">
          {data.label}
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-1.5 h-1.5" />
    </div>
  );
}

export default memo(AddressNode);

