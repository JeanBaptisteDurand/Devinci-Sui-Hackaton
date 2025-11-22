import { memo } from 'react';
import { Handle, Position } from 'reactflow';

interface EventNodeProps {
  data: {
    label: string;
    kind: string;
    eventId: string;
  };
}

function EventNode({ data }: EventNodeProps) {
  const kindColors: Record<string, { bg: string; border: string; text: string }> = {
    Publish: { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-700' },
    Upgrade: { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700' },
    Mint: { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-700' },
    Burn: { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-700' },
    Custom: { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700' },
  };

  const colors = kindColors[data.kind] || kindColors.Custom;

  return (
    <div
      className={`px-2.5 py-1.5 shadow-sm rounded-lg ${colors.bg} border-2 ${colors.border} min-w-[100px] max-w-[140px] transform rotate-45`}
    >
      <Handle type="target" position={Position.Top} className="w-1.5 h-1.5" />
      
      <div className="flex flex-col items-center gap-0.5 -rotate-45">
        <span className={`text-[10px] font-bold ${colors.text} uppercase`}>
          {data.kind}
        </span>
        <div className="font-mono text-[10px] text-gray-600 truncate max-w-full">
          {data.label}
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-1.5 h-1.5" />
    </div>
  );
}

export default memo(EventNode);

