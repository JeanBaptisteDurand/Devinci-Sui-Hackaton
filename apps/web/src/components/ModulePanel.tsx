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
      <div className="text-sm text-muted-foreground italic">No functions</div>
    );
  }

  return (
    <div className="border border-border rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 bg-muted/50 hover:bg-muted flex justify-between items-center rounded-t-lg"
      >
        <span className="text-sm font-medium text-foreground">
          Functions ({functions.length})
        </span>
        <span className="text-muted-foreground">
          {expanded ? '▼' : '▶'}
        </span>
      </button>
      {expanded && (
        <div>
          {/* View Full Source Code Button */}
          {onViewFullSource && (
            <div className="p-3 border-b border-border bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/40">
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
          <div className="divide-y divide-border">
            {functions.map((func, idx) => (
            <button
              key={idx}
              className="w-full px-4 py-3 hover:bg-accent hover:border-l-4 hover:border-blue-500 cursor-pointer transition-all text-left group"
              onClick={() => onFunctionClick?.(func)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-blue-500 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                    →
                  </span>
                  <span className="text-sm font-medium text-foreground group-hover:text-blue-700 dark:group-hover:text-blue-400 group-hover:underline transition-all">
                    {func.name}
                  </span>
                </div>
                <div className="flex gap-2">
                  {func.isEntry && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-2 py-1 rounded font-semibold">
                      Entry
                    </span>
                  )}
                  <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded font-medium">
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

