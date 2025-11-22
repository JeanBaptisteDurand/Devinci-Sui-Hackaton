
export default function MapLegend() {
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-gray-200 max-w-xs text-sm pointer-events-none select-none">
      <h3 className="font-semibold mb-3 text-gray-800">Map Legend</h3>
      
      <div className="space-y-4">
        {/* Nodes Section */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Nodes</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-100 border-2 border-yellow-500 rounded shadow-sm"></div>
              <span className="text-gray-700">Primary Package</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-100 border-2 border-blue-500 rounded shadow-sm"></div>
              <span className="text-gray-700">Package</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border-2 border-green-500 rounded shadow-sm"></div>
              <span className="text-gray-700">Module</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-100 border-2 border-purple-500 rounded shadow-sm"></div>
              <span className="text-gray-700">Type</span>
            </div>
          </div>
        </div>

        {/* Edges Section */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Edges</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-green-500"></div>
              <span className="text-gray-700">Package → Module</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-gray-400"></div>
              <span className="text-gray-700">Package → Package</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 border-t-2 border-red-500 border-dotted"></div>
              <span className="text-gray-700">Module → Module</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-purple-500"></div>
              <span className="text-gray-700">Type Relations</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-orange-500"></div>
              <span className="text-gray-700">Friend Module</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
