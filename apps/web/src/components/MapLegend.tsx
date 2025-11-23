
export default function MapLegend() {
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-card/90 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-border max-w-xs text-sm pointer-events-none select-none">
      <h3 className="font-semibold mb-3 text-foreground">Map Legend</h3>
      
      <div className="space-y-4">
        {/* Nodes Section */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Nodes</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-100 dark:bg-yellow-900/50 border-2 border-yellow-500 dark:border-yellow-400 rounded shadow-sm"></div>
              <span className="text-foreground">Primary Package</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-100 dark:bg-blue-900/50 border-2 border-blue-500 dark:border-blue-400 rounded shadow-sm"></div>
              <span className="text-foreground">Package</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 dark:bg-green-900/50 border-2 border-green-500 dark:border-green-400 rounded shadow-sm"></div>
              <span className="text-foreground">Module</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-100 dark:bg-purple-900/50 border-2 border-purple-500 dark:border-purple-400 rounded shadow-sm"></div>
              <span className="text-foreground">Type</span>
            </div>
          </div>
        </div>

        {/* Edges Section */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Edges</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-green-500"></div>
              <span className="text-foreground">Package → Module</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-gray-400 dark:bg-gray-600"></div>
              <span className="text-foreground">Package → Package</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 border-t-2 border-red-500 border-dotted"></div>
              <span className="text-foreground">Module → Module</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-purple-500"></div>
              <span className="text-foreground">Type Relations</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-orange-500"></div>
              <span className="text-foreground">Friend Module</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
