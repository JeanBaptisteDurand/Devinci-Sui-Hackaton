import { useState } from 'react';
import { Node, Edge as FlowEdge } from 'reactflow';
import ModulePanel from './ModulePanel';
import FunctionModal from './FunctionModal';
import FullSourceModal from './FullSourceModal';
import TypeModal from './TypeModal';
import EdgePanel from './EdgePanel';
import ObjectPanel from './ObjectPanel';
import EventPanel from './EventPanel';
import AddressPanel from './AddressPanel';
import EventsModal from './EventsModal';
import ExplanationModal from './ExplanationModal';
import { suiscanPackageUrl, suiexplorerPackageUrl, suiscanModuleUrl, suiexplorerModuleUrl } from '../utils/explorers';
import type { GraphData } from '@suilens/core';

interface RightDrawerProps {
  node: Node | null;
  edge: FlowEdge | null;
  graphData: GraphData | null;
  analysisId: string;
  onClose: () => void;
}

export default function RightDrawer({ node, edge, graphData, analysisId, onClose }: RightDrawerProps) {
  const [selectedFunction, setSelectedFunction] = useState<{
    func: { name: string; visibility: string; isEntry: boolean };
    moduleName: string;
  } | null>(null);
  
  const [selectedType, setSelectedType] = useState<string | null>(null);
  
  const [fullSourceModule, setFullSourceModule] = useState<{
    moduleName: string;
    displayName: string;
  } | null>(null);

  const [eventsModalConfig, setEventsModalConfig] = useState<{
    scope: 'pkg' | 'mod';
    id: string;
    title: string;
  } | null>(null);

  const [explanationModalConfig, setExplanationModalConfig] = useState<{
    type: 'module' | 'package';
    id: string;
    name: string;
    hasModules?: boolean;
  } | null>(null);

  // Handle edge panel
  if (edge) {
    return (
      <>
        <EdgePanel edge={edge} onClose={onClose} />
        {selectedFunction && (
          <FunctionModal
            func={selectedFunction.func}
            moduleName={selectedFunction.moduleName}
            onClose={() => setSelectedFunction(null)}
          />
        )}
      </>
    );
  }

  // Handle different node types
  if (!node) return null;

  // Route to specific panels based on node type
  // For TypeNode, open modal directly instead of sidebar
  if (node.type === 'typeNode') {
    const typeFqn = node.data?.typeFqn || node.data?.fqn || '';
    return (
      <TypeModal
        typeFqn={typeFqn}
        analysisId={analysisId}
        onClose={onClose}
      />
    );
  }

  if (node.type === 'objectNode') {
    return <ObjectPanel node={node} analysisId={analysisId} onClose={onClose} />;
  }

  if (node.type === 'eventNode') {
    return <EventPanel node={node} onClose={onClose} />;
  }

  if (node.type === 'addressNode') {
    return <AddressPanel node={node} graphData={graphData} onClose={onClose} />;
  }

  // Package and Module nodes - original logic with enhancements
  const isPackage = node.type === 'packageNode';
  const nodeData = node.data;

  // Find module data if it's a module node
  const moduleData = isPackage
    ? null
    : graphData?.modules?.find((m) => m.id === node.id);

  // Find package data and related modules
  const packageData = isPackage
    ? graphData?.packages?.find((p) => p.id === node.id)
    : null;
  const packageModules = isPackage && packageData
    ? graphData?.modules?.filter((m) => m.package === packageData.address) || []
    : [];

  const handleFunctionClick = (func: { name: string; visibility: string; isEntry: boolean }) => {
    if (moduleData) {
      setSelectedFunction({ func, moduleName: moduleData.fullName });
    }
  };

  const handleViewFullSource = () => {
    if (moduleData) {
      setFullSourceModule({
        moduleName: moduleData.fullName,
        displayName: moduleData.name,
      });
    }
  };

  return (
    <>
      <div className="absolute right-0 top-0 h-full w-80 bg-card shadow-xl z-10 overflow-y-auto border-l border-border">
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/50">
          <h2 className="text-lg font-semibold text-foreground">
            {isPackage ? 'Package Details' : 'Module Details'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {isPackage ? (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Address</label>
                <p className="mt-1 text-sm font-mono text-foreground break-all bg-muted p-2 rounded">
                  {nodeData.address}
                </p>
              </div>

              {/* Stats */}
              {nodeData.stats && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Statistics</label>
                  <div className="grid grid-cols-3 gap-2">
                    {nodeData.stats.modules !== undefined && (
                      <div className="bg-green-500/10 p-2 rounded text-center">
                        <div className="text-xs text-green-600 dark:text-green-400">Modules</div>
                        <div className="text-lg font-bold text-green-700 dark:text-green-300">{nodeData.stats.modules}</div>
                      </div>
                    )}
                    {nodeData.stats.types !== undefined && (
                      <div className="bg-violet-500/10 p-2 rounded text-center">
                        <div className="text-xs text-violet-600 dark:text-violet-400">Types</div>
                        <div className="text-lg font-bold text-violet-700 dark:text-violet-300">{nodeData.stats.types}</div>
                      </div>
                    )}
                    {nodeData.stats.recentEvents !== undefined && (
                      <div className="bg-yellow-500/10 p-2 rounded text-center">
                        <div className="text-xs text-yellow-600 dark:text-yellow-400">Events</div>
                        <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{nodeData.stats.recentEvents}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI Explanation Button */}
              <div>
                <button
                  onClick={() => setExplanationModalConfig({
                    type: 'package',
                    id: nodeData.address,
                    name: nodeData.address,
                    hasModules: packageModules.length > 0,
                  })}
                  className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-medium rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <span className="text-lg">🤖</span>
                  <span>See AI Explanation</span>
                </button>
              </div>

              {/* Explorer Links */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">View on Explorers</label>
                <div className="space-y-2">
                  <a
                    href={suiscanPackageUrl(nodeData.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full px-3 py-2 bg-blue-500 text-white text-center text-sm rounded hover:bg-blue-600 transition-colors"
                  >
                    View on SuiScan
                  </a>
                  <a
                    href={suiexplorerPackageUrl(nodeData.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full px-3 py-2 bg-green-500 text-white text-center text-sm rounded hover:bg-green-600 transition-colors"
                  >
                    View on Sui Explorer
                  </a>
                </div>
              </div>

              {packageModules.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Modules ({packageModules.length})
                  </label>
                  <div className="space-y-2">
                    {packageModules.map((mod) => (
                      <div
                        key={mod.id}
                        className="text-sm font-mono text-foreground bg-muted p-2 rounded"
                      >
                        {mod.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Module Name</label>
                <p className="mt-1 text-sm font-mono text-foreground bg-muted p-2 rounded">
                  {moduleData?.name || nodeData.moduleName}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                <p className="mt-1 text-xs font-mono text-muted-foreground break-all bg-muted p-2 rounded">
                  {moduleData?.fullName || nodeData.fullName}
                </p>
              </div>

              {/* Friends */}
              {moduleData?.friends && moduleData.friends.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Friend Modules ({moduleData.friends.length})
                  </label>
                  <div className="space-y-1">
                    {moduleData.friends.map((friend: string, idx: number) => (
                      <div key={idx} className="text-xs font-mono text-orange-600 dark:text-orange-400 bg-orange-500/10 p-2 rounded border border-orange-500/20">
                        {friend}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Module Calls */}
              {graphData && (() => {
                const moduleId = node.id;
                const callEdges = graphData.edges.filter(
                  (e: any) => e.kind === 'MOD_CALLS' && e.from === moduleId
                );
                
                if (callEdges.length === 0) return null;

                // Group by callType
                const friendCalls = callEdges.filter((e: any) => e.callType === 'friend');
                const samePackageCalls = callEdges.filter((e: any) => e.callType === 'samePackage');
                const externalCalls = callEdges.filter((e: any) => e.callType === 'external' || !e.callType);

                return (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      📞 Calls to Modules ({callEdges.length})
                    </label>
                    <div className="space-y-2">
                      {friendCalls.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">
                            🟢 Friend Modules ({friendCalls.length})
                          </div>
                          <div className="space-y-1">
                            {friendCalls.map((edge: any, idx: number) => {
                              const targetModule = edge.to.replace('mod:', '');
                              const simpleName = targetModule.split('::').pop();
                              return (
                                <div
                                  key={idx}
                                  className="text-xs font-mono text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-1 rounded border border-green-500/20"
                                  title={targetModule}
                                >
                                  {simpleName}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {samePackageCalls.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                            🔵 Same Package ({samePackageCalls.length})
                          </div>
                          <div className="space-y-1">
                            {samePackageCalls.map((edge: any, idx: number) => {
                              const targetModule = edge.to.replace('mod:', '');
                              const simpleName = targetModule.split('::').pop();
                              return (
                                <div
                                  key={idx}
                                  className="text-xs font-mono text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20"
                                  title={targetModule}
                                >
                                  {simpleName}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {externalCalls.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
                            🔴 External Packages ({externalCalls.length})
                          </div>
                          <div className="space-y-1">
                            {externalCalls.map((edge: any, idx: number) => {
                              const targetModule = edge.to.replace('mod:', '');
                              const simpleName = targetModule.split('::').pop();
                              return (
                                <div
                                  key={idx}
                                  className="text-xs font-mono text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-1 rounded border border-red-500/20"
                                  title={targetModule}
                                >
                                  {simpleName}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Constants */}
              {moduleData?.constants && moduleData.constants.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Constants ({moduleData.constants.length})
                  </label>
                  <div className="space-y-2">
                    {moduleData.constants.map((constant: any, idx: number) => (
                      <div key={idx} className="bg-blue-500/10 p-2 rounded border border-blue-500/20">
                        <div className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-300">{constant.name}</div>
                        <div className="font-mono text-xs text-blue-600 dark:text-blue-400 mt-1">
                          {constant.type}: {JSON.stringify(constant.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Flags */}
              {moduleData?.flags && moduleData.flags.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Security Flags ({moduleData.flags.length})
                  </label>
                  <div className="space-y-1">
                    {moduleData.flags.map((flag: string, idx: number) => (
                      <div key={idx} className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
                        ⚠️ {flag}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Types Defined */}
              {moduleData?.typesDefined && moduleData.typesDefined.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Types Defined ({moduleData.typesDefined.length})
                  </label>
                  <div className="space-y-1">
                    {moduleData.typesDefined.map((type: string, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedType(type)}
                        className="w-full text-left text-xs font-mono text-violet-600 dark:text-violet-400 bg-violet-500/10 p-2 rounded border border-violet-500/20 hover:bg-violet-500/20 hover:border-violet-500/40 transition-colors cursor-pointer"
                      >
                        {type.split('::').pop()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Explanation Button */}
              {moduleData && (
                <div>
                  <button
                    onClick={() => setExplanationModalConfig({
                      type: 'module',
                      id: moduleData.id || node.id,
                      name: moduleData.fullName,
                    })}
                    className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-medium rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    <span className="text-lg">🤖</span>
                    <span>See AI Explanation</span>
                  </button>
                </div>
              )}

              {/* Explorer Links */}
              {moduleData && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">View Code</label>
                  <div className="space-y-2">
                    <a
                      href={suiscanModuleUrl(moduleData.package, moduleData.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full px-3 py-2 bg-blue-500 text-white text-center text-sm rounded hover:bg-blue-600 transition-colors"
                    >
                      View on SuiScan
                    </a>
                    <a
                      href={suiexplorerModuleUrl(moduleData.package, moduleData.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full px-3 py-2 bg-green-500 text-white text-center text-sm rounded hover:bg-green-600 transition-colors"
                    >
                      View on Sui Explorer
                    </a>
                  </div>
                </div>
              )}

              {/* Recent Events Button */}
              {moduleData && (
                <div>
                  <button
                    onClick={() => setEventsModalConfig({
                      scope: 'mod',
                      id: moduleData.fullName,
                      title: moduleData.name,
                    })}
                    className="w-full px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded hover:bg-yellow-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Recent Events
                  </button>
                </div>
              )}

              {moduleData && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Functions ({moduleData.functions.length})
                  </label>
                  <ModulePanel
                    functions={moduleData.functions.map(f => ({
                      ...f,
                      isEntry: f.isEntry ?? false,
                    }))}
                    onFunctionClick={handleFunctionClick}
                    onViewFullSource={handleViewFullSource}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {selectedFunction && (
        <FunctionModal
          func={selectedFunction.func}
          moduleName={selectedFunction.moduleName}
          onClose={() => setSelectedFunction(null)}
        />
      )}
      {fullSourceModule && (
        <FullSourceModal
          moduleName={fullSourceModule.moduleName}
          moduleDisplayName={fullSourceModule.displayName}
          onClose={() => setFullSourceModule(null)}
        />
      )}
      {selectedType && (
        <TypeModal
          typeFqn={selectedType}
          analysisId={analysisId}
          onClose={() => setSelectedType(null)}
        />
      )}
      {eventsModalConfig && (
        <EventsModal
          analysisId={analysisId}
          scope={eventsModalConfig.scope}
          id={eventsModalConfig.id}
          title={eventsModalConfig.title}
          onClose={() => setEventsModalConfig(null)}
        />
      )}
      {explanationModalConfig && (
        <ExplanationModal
          type={explanationModalConfig.type}
          id={explanationModalConfig.id}
          name={explanationModalConfig.name}
          hasModules={explanationModalConfig.hasModules}
          onClose={() => setExplanationModalConfig(null)}
        />
      )}
    </>
  );
}

