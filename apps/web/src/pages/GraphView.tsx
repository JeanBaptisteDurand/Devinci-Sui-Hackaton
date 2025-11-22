import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge as FlowEdge,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Sparkles } from 'lucide-react';
import PackageNode from '../components/PackageNode';
import ModuleNode from '../components/ModuleNode';
import TypeNode from '../components/TypeNode';
import ObjectNode from '../components/ObjectNode';
import EventNode from '../components/EventNode';
import AddressNode from '../components/AddressNode';
import RightDrawer from '../components/RightDrawer';
import AiInterfaceDrawer from '../components/AiInterfaceDrawer';
import RagChatWidget from '../components/RagChatWidget';
import ControlMenu, { VisibilityState } from '../components/ControlMenu';
import MapLegend from '../components/MapLegend';
import { radialLayout } from '../utils/radialLayout';
import { logger } from '../utils/logger';
import { useAuth } from '@/hooks/use-auth';
import { useCurrentAccount } from '@mysten/dapp-kit';
import type { GraphData } from '@suilens/core';

const nodeTypes = {
  packageNode: PackageNode,
  moduleNode: ModuleNode,
  typeNode: TypeNode,
  objectNode: ObjectNode,
  eventNode: EventNode,
  addressNode: AddressNode,
};

export default function GraphView() {
  const { id } = useParams<{ id: string }>();
  const account = useCurrentAccount();
  const { getAuthHeaders, ensureAuthenticated, isAuthenticated } = useAuth();
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [metadata, setMetadata] = useState<{ network?: string; packageId?: string; depth?: number; createdAt?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<FlowEdge | null>(null);
  const [primaryPackageId, setPrimaryPackageId] = useState<string | null>(null);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  
  // Visibility state for control menu
  const [visibilityState, setVisibilityState] = useState<VisibilityState>({
    nodeTypes: {
      packageNode: true,
      moduleNode: true,
      typeNode: true,
      objectNode: true,
      eventNode: true,
      addressNode: true,
    },
    linkTypes: {
      PKG_CONTAINS: true,
      PKG_DEPENDS: true,
      MOD_CALLS: true,
      MOD_DEFINES_TYPE: true,
      TYPE_USES_TYPE: true,
      MOD_FRIEND_ALLOW: true,
      OBJ_INSTANCE_OF: true,
      OBJ_OWNED_BY: true,
      OBJ_DF_CHILD: true,
      OBJ_REFERS_OBJ: true,
      MOD_EMITS_EVENT: true,
      PKG_EMITS_EVENT: true,
    },
    packages: {},
    showDependencies: true,
  });
  
  // Use React Flow hooks for interactive nodes and edges
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (id) {
      logger.info('GraphView', `Component mounted with analysisId: ${id}`);
      if (account?.address && isAuthenticated) {
        fetchAnalysis(id);
      } else if (account?.address && !isAuthenticated) {
        ensureAuthenticated().then(() => fetchAnalysis(id));
      } else {
        setError('Please connect your wallet to view this analysis');
        setLoading(false);
      }
    }
  }, [id, account?.address, isAuthenticated]);

  useEffect(() => {
    if (graphData) {
      logger.info('GraphView', 'Graph data received, calculating v2 layout', {
        packages: graphData.packages?.length || 0,
        modules: graphData.modules?.length || 0,
        types: graphData.types?.length || 0,
        objects: graphData.objects?.length || 0,
        events: graphData.events?.length || 0,
        addresses: graphData.addresses?.length || 0,
        edges: graphData.edges?.length || 0,
        edgesData: graphData.edges,
      });

      // Log packages and their modules
      if (graphData.packages && graphData.modules) {
        console.log('Packages and their modules:');
        graphData.packages.forEach((pkg: GraphData['packages'][0]) => {
          const pkgModules = graphData.modules?.filter((mod: GraphData['modules'][0]) => mod.package === pkg.id);
          console.log(`Package: ${pkg.address} (${pkg.displayName || 'No name'})`);
          console.log('Modules:', pkgModules?.map((m: GraphData['modules'][0]) => m.name).join(', '));
        });
      }
      
      // Debug: Log some sample object data
      if (graphData.objects && graphData.objects.length > 0) {
        logger.debug('GraphView', 'Sample objects:', graphData.objects.slice(0, 3));
      } else {
        logger.warn('GraphView', 'No objects found in graph data!');
      }
      
      // Identify primary package (assume it's the first one)
      if (graphData.packages && graphData.packages.length > 0 && !primaryPackageId) {
        const primaryPkg = graphData.packages[0];
        setPrimaryPackageId(primaryPkg.id);
        logger.info('GraphView', 'Primary package identified', { primaryPackageId: primaryPkg.id });
      }
      
      // Filter graph data based on visibility state
      const filteredData = applyVisibilityFilters(graphData, visibilityState, primaryPackageId);
      
      const { nodes: layoutNodes, edges: layoutEdges } = radialLayout(filteredData, primaryPackageId);
      
      // Apply node type visibility filters to the rendered nodes
      const visibleNodes = layoutNodes.filter(node => {
        const nodeType = node.type as keyof VisibilityState['nodeTypes'];
        return visibilityState.nodeTypes[nodeType] !== false;
      });
      
      // Filter edges to only show those connected to visible nodes
      const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
      const visibleEdges = layoutEdges.filter(edge => {
        return visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target);
      });
      
      logger.info('GraphView', 'V2 layout calculated with visibility filters', {
        totalNodes: layoutNodes.length,
        visibleNodes: visibleNodes.length,
        totalEdges: layoutEdges.length,
        visibleEdges: visibleEdges.length,
      });
      
      setNodes(visibleNodes);
      setEdges(visibleEdges);
    }
  }, [graphData, visibilityState, primaryPackageId]);

  const fetchAnalysis = async (analysisId: string) => {
    try {
      logger.debug('GraphView', `Fetching analysis: ${analysisId}`);
      
      const response = await fetch(`/api/analysis/${analysisId}`, {
        headers: getAuthHeaders(),
      });
      
      logger.debug('GraphView', `Response received: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please connect your wallet and sign the message.');
        }
        if (response.status === 404) {
          throw new Error('Analysis not found or access denied');
        }
        throw new Error('Failed to fetch analysis');
      }
      
      const data: any = await response.json();
      
      logger.info('GraphView', 'Analysis data received', {
        packages: data.packages?.length || 0,
        modules: data.modules?.length || 0,
        edges: data.edges?.length || 0,
        packageAddresses: data.packages?.map((p: any) => p.address) || [],
        network: data._metadata?.network,
      });
      
      // Extract metadata if present
      if (data._metadata) {
        setMetadata(data._metadata);
      }
      
      // Detailed logging
      if (!data.packages || data.packages.length === 0) {
        logger.warn('GraphView', 'No packages in graph data!');
      }
      if (!data.modules || data.modules.length === 0) {
        logger.warn('GraphView', 'No modules in graph data!');
      }
      if (!data.edges || data.edges.length === 0) {
        logger.warn('GraphView', 'No edges in graph data!');
      }
      
      setGraphData(data);
    } catch (err: any) {
      logger.error('GraphView', 'Failed to fetch analysis', { error: err.message, stack: err.stack });
      setError(err.message || 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    logger.debug('GraphView', `Node clicked: ${node.id}`, { nodeType: node.type, nodeData: node.data });
    setSelectedNode(node);
    setSelectedEdge(null); // Clear edge selection
  }, []);

  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: FlowEdge) => {
    logger.debug('GraphView', `Edge clicked: ${edge.id}`, { edgeData: edge.data });
    setSelectedEdge(edge);
    setSelectedNode(null); // Clear node selection
  }, []);

  const applyVisibilityFilters = (
    data: GraphData,
    visibility: VisibilityState,
    primaryPkgId: string | null
  ): GraphData => {
    // First filter by dependencies if needed
    let filteredData = data;
    if (!visibility.showDependencies && primaryPkgId) {
      // Keep only the primary package
      const primaryPackage = data.packages.filter(pkg => pkg.id === primaryPkgId);
      
      // Keep only modules that belong to the primary package
      const primaryModules = data.modules.filter(mod => mod.package === primaryPkgId);
      const primaryModuleIds = new Set(primaryModules.map(m => m.id));
      
      // Keep only types that belong to primary modules
      const primaryTypes = data.types.filter(type => primaryModuleIds.has(type.module));
      const primaryTypeIds = new Set(primaryTypes.map(t => t.id));
      
      // Keep only objects of primary types
      const primaryObjects = data.objects.filter(obj => {
        const typeId = `type:${obj.typeFqn}` as `type:${string}`;
        return primaryTypeIds.has(typeId);
      });
      
      // Keep only events from primary package
      const primaryEvents = data.events.filter(evt => evt.pkg === primaryPkgId);
      
      // Filter edges to only include those between primary nodes
      const primaryNodeIds = new Set([
        ...primaryPackage.map(p => p.id),
        ...primaryModuleIds,
        ...primaryTypeIds,
        ...primaryObjects.map(o => o.id),
        ...primaryEvents.map(e => e.id),
      ]);
      
      const primaryEdges = data.edges.filter((edge: any) => {
        return primaryNodeIds.has(edge.from) && primaryNodeIds.has(edge.to);
      });
      
      filteredData = {
        ...data,
        packages: primaryPackage,
        modules: primaryModules,
        types: primaryTypes,
        objects: primaryObjects,
        events: primaryEvents,
        edges: primaryEdges,
      };
    }
    
    // Then filter by individual package visibility
    const visiblePackages = filteredData.packages.filter(pkg => {
      return visibility.packages[pkg.id] !== false;
    });
    const visiblePackageIds = new Set(visiblePackages.map(p => p.id));
    
    // Filter modules by package visibility
    const visibleModules = filteredData.modules.filter(mod => {
      return visiblePackageIds.has(mod.package);
    });
    const visibleModuleIds = new Set(visibleModules.map(m => m.id));
    
    // Filter types by module visibility
    const visibleTypes = filteredData.types.filter(type => {
      return visibleModuleIds.has(type.module);
    });
    const visibleTypeIds = new Set(visibleTypes.map(t => t.id));
    
    // Filter objects by type visibility
    const visibleObjects = filteredData.objects.filter(obj => {
      const typeId = `type:${obj.typeFqn}` as `type:${string}`;
      return visibleTypeIds.has(typeId);
    });
    
    // Filter events by package visibility
    const visibleEvents = filteredData.events.filter(evt => {
      return evt.pkg ? visiblePackageIds.has(evt.pkg) : true;
    });
    
    // Filter addresses (keep all for now, could be enhanced)
    const visibleAddresses = filteredData.addresses;
    
    // Filter edges by link type visibility
    const visibleEdges = filteredData.edges.filter((edge: any) => {
      return visibility.linkTypes[edge.kind as keyof VisibilityState['linkTypes']] !== false;
    });
    
    logger.info('GraphView', 'Applied visibility filters', {
      packages: visiblePackages.length,
      modules: visibleModules.length,
      types: visibleTypes.length,
      objects: visibleObjects.length,
      events: visibleEvents.length,
      edges: visibleEdges.length,
    });
    
    return {
      ...filteredData,
      packages: visiblePackages,
      modules: visibleModules,
      types: visibleTypes,
      objects: visibleObjects,
      events: visibleEvents,
      addresses: visibleAddresses,
      edges: visibleEdges,
    };
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-medium text-gray-700">Loading graph...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Network badge and AI Toggle */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
        {/* AI Interface Toggle */}
        <button
          onClick={() => setIsAiDrawerOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-blue-500 rounded-lg shadow-lg hover:bg-blue-50 transition-colors text-blue-700 font-bold"
        >
          <Sparkles className="w-4 h-4" />
          <span>AI Interface</span>
        </button>

        {/* Network badge */}
        {metadata?.network && (
          <div className="px-4 py-2 rounded-lg shadow-lg font-medium bg-white border-2 border-blue-500">
            <span className="text-xs text-gray-500 uppercase mr-2">Network:</span>
            <span className={`font-bold ${
              metadata.network === 'mainnet' ? 'text-green-600' : 
              metadata.network === 'testnet' ? 'text-orange-600' : 
              'text-blue-600'
            }`}>
              {metadata.network}
            </span>
          </div>
        )}
      </div>
      
      {/* Control Menu */}
      <ControlMenu
        graphData={graphData}
        visibilityState={visibilityState}
        onVisibilityChange={setVisibilityState}
      />
      
      

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-left"
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background />
        {/* Map Legend */}
      <MapLegend />
        <Controls 
        position='bottom-right'
        />
        {/* <MiniMap /> */}
      </ReactFlow>
      {(selectedNode || selectedEdge) && (
        <RightDrawer
          node={selectedNode}
          edge={selectedEdge}
          graphData={graphData}
          analysisId={id || ''}
          onClose={() => {
            setSelectedNode(null);
            setSelectedEdge(null);
          }}
        />
      )}
      
      <AiInterfaceDrawer 
        isOpen={isAiDrawerOpen} 
        onClose={() => setIsAiDrawerOpen(false)} 
        packageId={primaryPackageId || undefined}
        network={metadata?.network}
        analysisId={id || undefined}
        modules={graphData?.modules
          ?.filter((m: any) => m.package === primaryPackageId)
          .map((m: any) => ({ 
            name: m.name, 
            id: m.id,
            types: m.typesDefined?.map((t: string) => t.split('::').pop()) || []
          })) || []}
        dependencies={graphData?.packages
          ?.filter((p: any) => p.id !== primaryPackageId)
          .map((p: any) => ({
            id: p.id,
            name: p.displayName || p.address,
            modules: graphData.modules
              ?.filter((m: any) => m.package === p.id)
              .map((m: any) => ({ 
                name: m.name, 
                id: m.id,
                types: m.typesDefined?.map((t: string) => t.split('::').pop()) || []
              })) || []
          })) || []}
      />

      {/* RAG Chat Widget */}
      {/* <RagChatWidget
        packageId={metadata?.packageId}
        analysisId={id || ''}
      /> */}
    </div>
  );
}

