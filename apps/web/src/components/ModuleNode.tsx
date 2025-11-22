import { Handle, Position } from 'reactflow';
import { NodeProps } from 'reactflow';

interface ModuleNodeData {
  label: string;
  moduleName: string;
}

export default function ModuleNode({ data }: NodeProps<ModuleNodeData>) {
  return (
    <div className="px-3 py-2 shadow-md rounded-lg bg-green-500 text-white font-medium min-w-[100px] text-center">
      <Handle type="target" position={Position.Top} />
      <div className="text-sm">{data.label || data.moduleName}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

