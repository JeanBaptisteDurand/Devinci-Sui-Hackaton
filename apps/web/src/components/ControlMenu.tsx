import { useState } from 'react';
import type { GraphData } from '@suilens/core';

export interface VisibilityState {
  nodeTypes: {
    packageNode: boolean;
    moduleNode: boolean;
    typeNode: boolean;
    objectNode: boolean;
    eventNode: boolean;
    addressNode: boolean;
  };
  linkTypes: {
    PKG_CONTAINS: boolean;
    PKG_DEPENDS: boolean;
    MOD_CALLS: boolean;
    MOD_DEFINES_TYPE: boolean;
    TYPE_USES_TYPE: boolean;
    MOD_FRIEND_ALLOW: boolean;
    OBJ_INSTANCE_OF: boolean;
    OBJ_OWNED_BY: boolean;
    OBJ_DF_CHILD: boolean;
    OBJ_REFERS_OBJ: boolean;
    MOD_EMITS_EVENT: boolean;
    PKG_EMITS_EVENT: boolean;
  };
  packages: Record<string, boolean>; // packageId -> visibility
  showDependencies: boolean;
}

interface ControlMenuProps {
  graphData: GraphData | null;
  visibilityState: VisibilityState;
  onVisibilityChange: (state: VisibilityState) => void;
}

export default function ControlMenu({ graphData, visibilityState, onVisibilityChange }: ControlMenuProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'nodes' | 'links' | 'packages'>('nodes');

  const updateState = (updates: Partial<VisibilityState>) => {
    onVisibilityChange({ ...visibilityState, ...updates });
  };

  const toggleNodeType = (nodeType: keyof VisibilityState['nodeTypes']) => {
    updateState({
      nodeTypes: {
        ...visibilityState.nodeTypes,
        [nodeType]: !visibilityState.nodeTypes[nodeType],
      },
    });
  };

  const toggleLinkType = (linkType: keyof VisibilityState['linkTypes']) => {
    updateState({
      linkTypes: {
        ...visibilityState.linkTypes,
        [linkType]: !visibilityState.linkTypes[linkType],
      },
    });
  };

  const togglePackage = (packageId: string) => {
    updateState({
      packages: {
        ...visibilityState.packages,
        [packageId]: !visibilityState.packages[packageId],
      },
    });
  };

  const toggleDependencies = () => {
    updateState({
      showDependencies: !visibilityState.showDependencies,
    });
  };

  if (!isExpanded) {
    return (
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => setIsExpanded(true)}
          className="px-4 py-2 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow border border-gray-200"
        >
          <span className="text-lg">☰</span>
        </button>
      </div>
    );
  }

  const nodeTypeLabels: Record<keyof VisibilityState['nodeTypes'], string> = {
    packageNode: '📦 Packages',
    moduleNode: '📄 Modules',
    typeNode: '🔷 Types',
    objectNode: '🎁 Objects',
    eventNode: '⚡ Events',
    addressNode: '📍 Addresses',
  };

  const linkTypeLabels: Record<keyof VisibilityState['linkTypes'], string> = {
    PKG_CONTAINS: '📦→📄 Package Contains',
    PKG_DEPENDS: '📦→📦 Package Depends',
    MOD_CALLS: '📄→📄 Module Calls',
    MOD_DEFINES_TYPE: '📄→🔷 Module Defines Type',
    TYPE_USES_TYPE: '🔷→🔷 Type Uses Type',
    MOD_FRIEND_ALLOW: '📄→📄 Friend Allow',
    OBJ_INSTANCE_OF: '🎁→🔷 Object Instance Of',
    OBJ_OWNED_BY: '🎁→📍 Object Owned By',
    OBJ_DF_CHILD: '🎁→🎁 Dynamic Field Child',
    OBJ_REFERS_OBJ: '🎁→🎁 Object Refers Object',
    MOD_EMITS_EVENT: '📄→⚡ Module Emits Event',
    PKG_EMITS_EVENT: '📦→⚡ Package Emits Event',
  };

  // Get link types that actually exist in the current graph data
  const existingLinkTypes = new Set<string>();
  if (graphData?.edges) {
    graphData.edges.forEach((edge: any) => {
      if (edge.kind) {
        existingLinkTypes.add(edge.kind);
      }
    });
  }

  // Get node type counts
  const nodeTypeCounts: Partial<Record<keyof VisibilityState['nodeTypes'], number>> = {
    packageNode: graphData?.packages?.length || 0,
    moduleNode: graphData?.modules?.length || 0,
    typeNode: graphData?.types?.length || 0,
    objectNode: graphData?.objects?.length || 0,
    eventNode: graphData?.events?.length || 0,
    addressNode: graphData?.addresses?.length || 0,
  };

  return (
    <div className="absolute top-4 left-4 z-10 w-80 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-4 py-3 flex justify-between items-center">
        <h3 className="text-white font-semibold text-sm">Control Panel</h3>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-white hover:text-gray-200 text-xl leading-none font-bold"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('nodes')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'nodes'
              ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-700'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Nodes
        </button>
        <button
          onClick={() => setActiveTab('links')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'links'
              ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-700'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Links
        </button>
        <button
          onClick={() => setActiveTab('packages')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'packages'
              ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-700'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Packages
        </button>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {activeTab === 'nodes' && (
          <div className="p-4 space-y-2">
            {Object.entries(nodeTypeLabels)
              .filter(([nodeType]) => {
                const count = nodeTypeCounts[nodeType as keyof VisibilityState['nodeTypes']] || 0;
                return count > 0;
              })
              .map(([nodeType, label]) => {
                const count = nodeTypeCounts[nodeType as keyof VisibilityState['nodeTypes']] || 0;
                return (
                  <label
                    key={nodeType}
                    className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {count}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={visibilityState.nodeTypes[nodeType as keyof VisibilityState['nodeTypes']]}
                      onChange={() => toggleNodeType(nodeType as keyof VisibilityState['nodeTypes'])}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                  </label>
                );
              })}
            {Object.values(nodeTypeCounts).every(count => count === 0) && (
              <div className="text-sm text-gray-500 italic text-center py-4">
                No nodes found in graph
              </div>
            )}
          </div>
        )}

        {activeTab === 'links' && (
          <div className="p-4 space-y-2">
            {Object.entries(linkTypeLabels)
              .filter(([linkType]) => existingLinkTypes.has(linkType))
              .map(([linkType, label]) => (
                <label
                  key={linkType}
                  className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <input
                    type="checkbox"
                    checked={visibilityState.linkTypes[linkType as keyof VisibilityState['linkTypes']]}
                    onChange={() => toggleLinkType(linkType as keyof VisibilityState['linkTypes'])}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                </label>
              ))}
            {existingLinkTypes.size === 0 && (
              <div className="text-sm text-gray-500 italic text-center py-4">
                No link types found in graph
              </div>
            )}
          </div>
        )}

        {activeTab === 'packages' && (
          <div className="p-4 space-y-3">
            {/* Hide Dependencies Button */}
            {graphData && graphData.packages && graphData.packages.length > 1 && (
              <div className="mb-4 pb-4 border-b border-gray-200">
                <button
                  onClick={toggleDependencies}
                  className={`w-full px-4 py-2 rounded-lg font-medium transition-all ${
                    visibilityState.showDependencies
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {visibilityState.showDependencies ? (
                    <>
                      <span className="mr-2">👁️</span>
                      Hide Dependencies
                    </>
                  ) : (
                    <>
                      <span className="mr-2">👁️‍🗨️</span>
                      Show Dependencies ({graphData.packages.length - 1})
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Individual Package Toggles */}
            {graphData?.packages?.map((pkg, index) => {
              const isPrimary = index === 0;
              return (
                <label
                  key={pkg.id}
                  className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${
                    isPrimary
                      ? 'bg-yellow-50 hover:bg-yellow-100 border border-yellow-300'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex-1 min-w-0 mr-2">
                    {isPrimary && (
                      <div className="text-xs font-semibold text-yellow-700 mb-1">
                        PRIMARY PACKAGE
                      </div>
                    )}
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {pkg.displayName || pkg.address}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {pkg.address.slice(0, 12)}...{pkg.address.slice(-6)}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={visibilityState.packages[pkg.id] !== false}
                    onChange={() => togglePackage(pkg.id)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

