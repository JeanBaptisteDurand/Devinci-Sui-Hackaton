import { Node, Edge } from 'reactflow';
import { logger } from './logger';

interface GraphData {
  packages: Array<{ id: string; address: string }>;
  modules: Array<{
    id: string;
    package: string;
    name: string;
    functions: Array<{
      name: string;
      visibility: string;
      isEntry: boolean;
    }>;
  }>;
  edges: Array<{
    kind: string;
    from: string;
    to: string;
  }>;
}

export function radialLayout(graphData: GraphData): { nodes: Node[]; edges: Edge[] } {
  logger.debug('radialLayout', 'Starting layout calculation', {
    packages: graphData.packages?.length || 0,
    modules: graphData.modules?.length || 0,
    edges: graphData.edges?.length || 0,
  });
  
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const { packages, modules, edges: graphEdges } = graphData;
  
  if (!packages || !modules || !graphEdges) {
    logger.error('radialLayout', 'Invalid graph data structure', { graphData });
    return { nodes, edges };
  }

  // Calculate center of viewport
  const centerX = 0;
  const centerY = 0;

  // Package layout: arrange in a circle
  const packageCount = packages.length;
  const packageRadius = Math.max(250, packageCount * 40);

  packages.forEach((pkg, index) => {
    const angle = (2 * Math.PI * index) / packageCount;
    const x = centerX + packageRadius * Math.cos(angle);
    const y = centerY + packageRadius * Math.sin(angle);

    nodes.push({
      id: pkg.id,
      type: 'packageNode',
      position: { x, y },
      data: {
        label: `Package ${index + 1}`,
        address: pkg.address,
      },
    });
  });

  // Module layout: orbit around their package
  const modulesByPackage = new Map<string, typeof modules>();
  modules.forEach((mod) => {
    const pkgId = `pkg:${mod.package}`;
    if (!modulesByPackage.has(pkgId)) {
      modulesByPackage.set(pkgId, []);
    }
    modulesByPackage.get(pkgId)!.push(mod);
  });

  modulesByPackage.forEach((mods, pkgId) => {
    const packageNode = nodes.find((n) => n.id === pkgId);
    if (!packageNode) return;

    const modCount = mods.length;
    const moduleRadius = 180;
    const startAngle = Math.PI / 4; // Start at 45 degrees for better visual

    mods.forEach((mod, index) => {
      const angle = startAngle + (2 * Math.PI * index) / modCount;
      const x = packageNode.position.x + moduleRadius * Math.cos(angle);
      const y = packageNode.position.y + moduleRadius * Math.sin(angle);

      nodes.push({
        id: mod.id,
        type: 'moduleNode',
        position: { x, y },
        data: {
          label: mod.name,
          moduleName: mod.name,
        },
      });
    });
  });

  // Create edges
  logger.debug('radialLayout', `Creating ${graphEdges.length} edges`);
  graphEdges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.from);
    const targetNode = nodes.find((n) => n.id === edge.to);

    if (sourceNode && targetNode) {
      // Different styles based on edge type
      let edgeStyle = {
        stroke: '#3b82f6',
        strokeWidth: 2,
      };
      let edgeType = 'smoothstep';
      let animated = false;
      
      if (edge.kind === 'PKG_DEPENDS') {
        // Package dependencies: gray, thick
        edgeStyle = { stroke: '#94a3b8', strokeWidth: 3 };
        edgeType = 'default';
      } else if (edge.kind === 'PKG_CONTAINS') {
        // Package contains module: green, solid
        edgeStyle = { stroke: '#10b981', strokeWidth: 2 };
        edgeType = 'straight';
      } else if (edge.kind === 'MOD_CALLS') {
        // Module calls: blue, animated
        edgeStyle = { stroke: '#3b82f6', strokeWidth: 2 };
        edgeType = 'smoothstep';
        animated = true;
      }
      
      edges.push({
        id: `${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        type: edgeType,
        style: edgeStyle,
        animated: animated,
      });
    } else {
      logger.warn('radialLayout', `Edge references missing nodes: ${edge.from} -> ${edge.to}`, {
        hasSource: !!sourceNode,
        hasTarget: !!targetNode,
      });
    }
  });

  logger.info('radialLayout', 'Layout complete', {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    packageNodes: nodes.filter(n => n.type === 'packageNode').length,
    moduleNodes: nodes.filter(n => n.type === 'moduleNode').length,
  });

  return { nodes, edges };
}

