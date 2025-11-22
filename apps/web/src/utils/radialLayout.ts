import { Node, Edge } from 'reactflow';
import { logger } from './logger';
import type {
  GraphData,
  PackageNode as PkgNode,
  ModuleNode as ModNode,
  TypeNode as TypNode,
  ObjectNode as ObjNode,
  EventNode as EvtNode,
  AddressNode as AddrNode,
} from '@suilens/core';

/**
 * Radial layout algorithm for Sui package analysis graphs
 * Arranges packages in a circle, with modules, types, objects, events, and addresses
 * orbiting around their parent nodes.
 * 
 * @param graphData - The graph data containing packages, modules, types, objects, events, addresses, and edges
 * @param primaryPackageId - Optional ID of the primary package to highlight
 * @returns Object containing positioned nodes and styled edges for ReactFlow
 */
export function radialLayout(
  graphData: GraphData,
  primaryPackageId?: string | null
): { nodes: Node[]; edges: Edge[] } {
  logger.debug('radialLayout', 'Starting layout calculation', {
    packages: graphData.packages?.length || 0,
    modules: graphData.modules?.length || 0,
    types: graphData.types?.length || 0,
    objects: graphData.objects?.length || 0,
    events: graphData.events?.length || 0,
    addresses: graphData.addresses?.length || 0,
    edges: graphData.edges?.length || 0,
    primaryPackageId,
  });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const { packages, modules, types, objects, events, addresses, edges: graphEdges } = graphData;

  // Calculate center of viewport
  const centerX = 0;
  const centerY = 0;

  // Package layout: arrange in a circle with increased spacing
  const packageCount = packages.length;
  // Increased spacing: from 120 to 180 per package, and minimum radius from 600 to 800
  const packageRadius = Math.max(800, packageCount * 180);

  packages.forEach((pkg: PkgNode, index) => {
    const angle = (2 * Math.PI * index) / packageCount;
    const x = centerX + packageRadius * Math.cos(angle);
    const y = centerY + packageRadius * Math.sin(angle);
    const isPrimary = primaryPackageId ? pkg.id === primaryPackageId : index === 0;

    nodes.push({
      id: pkg.id,
      type: 'packageNode',
      position: { x, y },
      data: {
        label: pkg.displayName || pkg.address,
        address: pkg.address,
        displayName: pkg.displayName,
        stats: pkg.stats,
        isPrimary,
      },
    });
  });

  // Module layout: orbit around their package
  const modulesByPackage = new Map<string, ModNode[]>();
  modules.forEach((mod) => {
    if (!modulesByPackage.has(mod.package)) {
      modulesByPackage.set(mod.package, []);
    }
    modulesByPackage.get(mod.package)!.push(mod);
  });

  modulesByPackage.forEach((mods, pkgId) => {
    const packageNode = nodes.find((n) => n.id === pkgId);
    if (!packageNode) return;

    const modCount = mods.length;
    const moduleRadius = 350; // Increased from 220 for more spacing
    const startAngle = Math.PI / 4;

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
          fullName: mod.fullName,
          functions: mod.functions,
          flags: mod.flags,
        },
      });
    });
  });

  // Type layout: place near their defining module
  const typesByModule = new Map<string, TypNode[]>();
  types.forEach((type) => {
    if (!typesByModule.has(type.module)) {
      typesByModule.set(type.module, []);
    }
    typesByModule.get(type.module)!.push(type);
  });

  typesByModule.forEach((typs, modId) => {
    const moduleNode = nodes.find((n) => n.id === modId);
    if (!moduleNode) return;

    const typeCount = typs.length;
    const typeRadius = 140; // Increased from 100 for better spacing from modules
    const startAngle = -Math.PI / 2;

    typs.forEach((type, index) => {
      const angle = startAngle + (Math.PI * index) / Math.max(typeCount - 1, 1);
      const x = moduleNode.position.x + typeRadius * Math.cos(angle);
      const y = moduleNode.position.y + typeRadius * Math.sin(angle);

      const typeName = type.fqn.split('::').pop() || type.fqn;

      nodes.push({
        id: type.id,
        type: 'typeNode',
        position: { x, y },
        data: {
          label: typeName,
          typeFqn: type.fqn,
          hasKey: type.hasKey,
          fieldsCount: type.fields?.length || 0,
        },
      });
    });
  });

  // Object layout: cluster near their type (sample only first 20 to avoid clutter)
  const objectsByType = new Map<string, ObjNode[]>();
  objects.slice(0, 30).forEach((obj) => {
    const typeId = `type:${obj.typeFqn}`;
    if (!objectsByType.has(typeId)) {
      objectsByType.set(typeId, []);
    }
    objectsByType.get(typeId)!.push(obj);
  });

  objectsByType.forEach((objs, typeId) => {
    const typeNode = nodes.find((n) => n.id === typeId);
    if (!typeNode) return;

    const objCount = Math.min(objs.length, 8); // Max 8 objects per type
    const objRadius = 60;

    objs.slice(0, objCount).forEach((obj, index) => {
      const angle = (2 * Math.PI * index) / objCount;
      const x = typeNode.position.x + objRadius * Math.cos(angle);
      const y = typeNode.position.y + objRadius * Math.sin(angle);

      const shortId = obj.objectId.slice(0, 6) + '...' + obj.objectId.slice(-4);

      nodes.push({
        id: obj.id,
        type: 'objectNode',
        position: { x, y },
        data: {
          label: shortId,
          objectId: obj.objectId,
          shared: obj.shared,
          ownerKind: obj.owner.kind,
        },
      });
    });
  });

  // Event layout: place around packages (sample only)
  const eventsByPackage = new Map<string, EvtNode[]>();
  events.slice(0, 20).forEach((evt) => {
    if (evt.pkg) {
      if (!eventsByPackage.has(evt.pkg)) {
        eventsByPackage.set(evt.pkg, []);
      }
      eventsByPackage.get(evt.pkg)!.push(evt);
    }
  });

  eventsByPackage.forEach((evts, pkgId) => {
    const packageNode = nodes.find((n) => n.id === pkgId);
    if (!packageNode) return;

    const evtCount = Math.min(evts.length, 6);
    const evtRadius = 280;
    const startAngle = -Math.PI / 3;

    evts.slice(0, evtCount).forEach((evt, index) => {
      const angle = startAngle + (2 * Math.PI * index) / evtCount;
      const x = packageNode.position.x + evtRadius * Math.cos(angle);
      const y = packageNode.position.y + evtRadius * Math.sin(angle);

      const shortId = evt.tx?.slice(0, 6) || 'event';

      nodes.push({
        id: evt.id,
        type: 'eventNode',
        position: { x, y },
        data: {
          label: shortId,
          kind: evt.kind,
          eventId: evt.id,
        },
      });
    });
  });

  // Address layout: place near objects that they own (sample only)
  const sampledAddresses = addresses.slice(0, 10);
  sampledAddresses.forEach((addr: AddrNode) => {
    // Find an object owned by this address
    const ownedObjEdge = graphEdges.find(
      (e) => e.kind === 'OBJ_OWNED_BY' && e.to === addr.id
    );

    if (ownedObjEdge) {
      const objNode = nodes.find((n) => n.id === ownedObjEdge.from);
      if (objNode) {
        const x = objNode.position.x + 70;
        const y = objNode.position.y - 30;

        const shortAddr = addr.address.slice(0, 6) + '...';

        nodes.push({
          id: addr.id,
          type: 'addressNode',
          position: { x, y },
          data: {
            label: shortAddr,
            address: addr.address,
          },
        });
      }
    }
  });

  // Create edges with different styles
  graphEdges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.from);
    const targetNode = nodes.find((n) => n.id === edge.to);

    if (sourceNode && targetNode) {
      let edgeStyle: any = { stroke: '#3b82f6', strokeWidth: 2 };
      let edgeType: any = 'smoothstep';
      let animated = false;
      let label = '';

      switch (edge.kind) {
        case 'PKG_CONTAINS':
          edgeStyle = { stroke: '#10b981', strokeWidth: 2 };
          edgeType = 'straight';
          break;
        case 'PKG_DEPENDS':
          edgeStyle = { stroke: '#94a3b8', strokeWidth: 3 };
          edgeType = 'default';
          break;
        case 'MOD_CALLS':
          // Different colors based on call type
          const callType = (edge as any).callType;
          if (callType === 'friend') {
            edgeStyle = { stroke: '#22c55e', strokeWidth: 2 }; // green for friends
            label = 'friend';
          } else if (callType === 'samePackage') {
            edgeStyle = { stroke: '#3b82f6', strokeWidth: 2 }; // blue for same package
          } else {
            edgeStyle = { stroke: '#ef4444', strokeWidth: 2 }; // red for external
          }
          edgeType = 'smoothstep';
          animated = true;
          break;
        case 'MOD_DEFINES_TYPE':
          edgeStyle = { stroke: '#8b5cf6', strokeWidth: 1.5 };
          edgeType = 'straight';
          break;
        case 'TYPE_USES_TYPE':
          edgeStyle = { stroke: '#ec4899', strokeWidth: 1.5 }; // pink
          edgeType = 'smoothstep';
          break;
        case 'MOD_FRIEND_ALLOW':
          edgeStyle = { stroke: '#f97316', strokeWidth: 2 };
          edgeType = 'default';
          break;
        case 'OBJ_INSTANCE_OF':
          edgeStyle = { stroke: '#6b7280', strokeWidth: 1 };
          edgeType = 'straight';
          break;
        case 'OBJ_OWNED_BY':
          edgeStyle = { stroke: '#f59e0b', strokeWidth: 1.5 };
          edgeType = 'smoothstep';
          break;
        case 'OBJ_DF_CHILD':
          edgeStyle = { stroke: '#374151', strokeWidth: 1.5, strokeDasharray: '5,5' }; // dark gray dotted
          edgeType = 'smoothstep';
          animated = true;
          break;
        case 'OBJ_REFERS_OBJ':
          edgeStyle = { stroke: '#64748b', strokeWidth: 1.5, strokeDasharray: '10,5' }; // slate dashed
          edgeType = 'smoothstep';
          break;
        case 'MOD_EMITS_EVENT':
        case 'PKG_EMITS_EVENT':
          edgeStyle = { stroke: '#eab308', strokeWidth: 1.5 };
          edgeType = 'default';
          break;
      }

      edges.push({
        id: `${edge.from}-${edge.to}-${edge.kind}`,
        source: edge.from,
        target: edge.to,
        type: edgeType,
        style: edgeStyle,
        animated,
        label,
        data: { kind: edge.kind, evidence: edge },
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
    packageNodes: nodes.filter((n) => n.type === 'packageNode').length,
    moduleNodes: nodes.filter((n) => n.type === 'moduleNode').length,
    typeNodes: nodes.filter((n) => n.type === 'typeNode').length,
    objectNodes: nodes.filter((n) => n.type === 'objectNode').length,
    eventNodes: nodes.filter((n) => n.type === 'eventNode').length,
    addressNodes: nodes.filter((n) => n.type === 'addressNode').length,
  });

  return { nodes, edges };
}
