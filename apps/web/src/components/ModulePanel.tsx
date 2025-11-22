import { useState } from 'react';

interface Function {
  name: string;
  visibility: string;
  isEntry: boolean;
}

interface ModulePanelProps {
  functions: Function[];
  onFunctionClick?: (func: Function) => void;
  onViewFullSource?: () => void;
}

export default function ModulePanel({ functions, onFunctionClick, onViewFullSource }: ModulePanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (functions.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">No functions</div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 bg-gray-50 hover:bg-gray-100 flex justify-between items-center rounded-t-lg"
      >
        <span className="text-sm font-medium text-gray-700">
          Functions ({functions.length})
        </span>
        <span className="text-gray-500">
          {expanded ? '▼' : '▶'}
        </span>
      </button>
      {expanded && (
        <div>
          {/* View Full Source Code Button */}
          {onViewFullSource && (
            <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-purple-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewFullSource();
                }}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>🔮</span>
                <span>View Full Source Code</span>
              </button>
            </div>
          )}
          
          {/* Function List */}
          <div className="divide-y divide-gray-100">
            {functions.map((func, idx) => (
            <button
              key={idx}
              className="w-full px-4 py-3 hover:bg-blue-50 hover:border-l-4 hover:border-blue-500 cursor-pointer transition-all text-left group"
              onClick={() => onFunctionClick?.(func)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-blue-500 group-hover:text-blue-700 transition-colors">
                    →
                  </span>
                  <span className="text-sm font-medium text-gray-900 group-hover:text-blue-700 group-hover:underline transition-all">
                    {func.name}
                  </span>
                </div>
                <div className="flex gap-2">
                  {func.isEntry && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-semibold">
                      Entry
                    </span>
                  )}
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-medium">
                    {func.visibility}
                  </span>
                </div>
              </div>
            </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

