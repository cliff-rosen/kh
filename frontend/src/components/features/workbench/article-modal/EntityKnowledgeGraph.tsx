import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
  ConnectionMode,
  Handle,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Maximize2, 
  Minimize2, 
  RotateCw
} from 'lucide-react';

import { 
  Entity, 
  Relationship, 
  EntityType, 
  RelationshipType,
  EntityRelationshipAnalysis 
} from '@/types/entity-extraction';

interface EntityKnowledgeGraphProps {
  analysis: EntityRelationshipAnalysis;
}

// Custom node component for entities
function EntityNode({ data }: NodeProps<{ entity: Entity; type: EntityType }>) {
  const getNodeColor = (type: EntityType): string => {
    const colors: Record<EntityType, string> = {
      medical_condition: '#ef4444', // red
      biological_factor: '#10b981', // green
      intervention: '#3b82f6', // blue
      patient_characteristic: '#f59e0b', // yellow
      psychological_factor: '#8b5cf6', // purple
      outcome: '#f97316', // orange
      gene: '#06b6d4', // cyan
      protein: '#6366f1', // indigo
      pathway: '#ec4899', // pink
      drug: '#059669', // emerald
      environmental_factor: '#84cc16', // lime
      animal_model: '#f472b6', // pink-400
      exposure: '#fb7185', // rose-400
      other: '#6b7280' // gray
    };
    return colors[type] || colors.other;
  };

  const color = getNodeColor(data.type);

  return (
    <div 
      className="px-4 py-3 rounded-lg border-2 bg-white dark:bg-gray-800 shadow-lg min-w-[150px] max-w-[250px]"
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <div className="space-y-1">
        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 text-center">
          {data.entity.name}
        </div>
        <Badge 
          className="text-xs w-full justify-center"
          style={{ 
            backgroundColor: `${color}20`,
            color: color,
            borderColor: color
          }}
        >
          {data.type.replace('_', ' ')}
        </Badge>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
}

const nodeTypes = {
  entity: EntityNode,
};

export function EntityKnowledgeGraph({ analysis }: EntityKnowledgeGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Force-directed layout algorithm
  const calculateLayout = useCallback((entities: Entity[], relationships: Relationship[]) => {
    const positions: Record<string, { x: number; y: number }> = {};
    const nodeCount = entities.length;
    
    // Initial positions - spread nodes in a circle
    entities.forEach((entity, index) => {
      const angle = (2 * Math.PI * index) / nodeCount;
      const radius = Math.min(300, Math.max(200, nodeCount * 20));
      positions[entity.id] = {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      };
    });

    // Apply force-directed adjustments
    const iterations = 50;
    const repulsionStrength = 10000;
    const attractionStrength = 0.01;
    const damping = 0.9;

    for (let iter = 0; iter < iterations; iter++) {
      const forces: Record<string, { x: number; y: number }> = {};
      
      // Initialize forces
      entities.forEach(entity => {
        forces[entity.id] = { x: 0, y: 0 };
      });

      // Repulsion forces between all nodes
      entities.forEach((entity1, i) => {
        entities.forEach((entity2, j) => {
          if (i >= j) return;
          
          const dx = positions[entity2.id].x - positions[entity1.id].x;
          const dy = positions[entity2.id].y - positions[entity1.id].y;
          const distance = Math.sqrt(dx * dx + dy * dy) + 0.1;
          
          const force = repulsionStrength / (distance * distance);
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          
          forces[entity1.id].x -= fx;
          forces[entity1.id].y -= fy;
          forces[entity2.id].x += fx;
          forces[entity2.id].y += fy;
        });
      });

      // Attraction forces for connected nodes
      relationships.forEach(rel => {
        const source = positions[rel.source_entity_id];
        const target = positions[rel.target_entity_id];
        
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          const force = distance * attractionStrength;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          
          forces[rel.source_entity_id].x += fx;
          forces[rel.source_entity_id].y += fy;
          forces[rel.target_entity_id].x -= fx;
          forces[rel.target_entity_id].y -= fy;
        }
      });

      // Apply forces with damping
      entities.forEach(entity => {
        positions[entity.id].x += forces[entity.id].x * damping;
        positions[entity.id].y += forces[entity.id].y * damping;
      });
    }

    return positions;
  }, []);

  // Convert entities and relationships to ReactFlow format
  useEffect(() => {
    if (!analysis) return;

    const positions = calculateLayout(analysis.entities, analysis.relationships);

    // Create nodes from entities
    const flowNodes: Node[] = analysis.entities.map((entity) => {
      return {
        id: entity.id,
        type: 'entity',
        position: positions[entity.id],
        data: { 
          entity,
          type: entity.type
        },
      };
    });

    // Create edges from relationships
    const flowEdges: Edge[] = analysis.relationships.map((rel, index) => {
      const edgeColor = getRelationshipColor(rel.type);
      
      return {
        id: `${rel.source_entity_id}-${rel.target_entity_id}-${index}`,
        source: rel.source_entity_id,
        target: rel.target_entity_id,
        type: 'smoothstep',
        animated: rel.type === 'causal' || rel.type === 'therapeutic',
        style: { 
          stroke: edgeColor,
          strokeWidth: rel.strength === 'strong' ? 3 : rel.strength === 'moderate' ? 2 : 1,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
        },
        label: rel.type,
        labelStyle: { 
          fontSize: 12,
          fontWeight: 500,
          fill: edgeColor,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          padding: '2px 4px',
          borderRadius: '3px',
        },
        data: rel,
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [analysis, setNodes, setEdges]);

  const getRelationshipColor = (type: RelationshipType): string => {
    const colors: Record<RelationshipType, string> = {
      causal: '#dc2626', // red
      therapeutic: '#16a34a', // green
      associative: '#2563eb', // blue
      temporal: '#ca8a04', // yellow
      inhibitory: '#7c3aed', // purple
      regulatory: '#0891b2', // cyan
      interactive: '#4f46e5', // indigo
      paradoxical: '#ea580c', // orange
      correlative: '#d946ef', // fuchsia
      predictive: '#06b6d4' // cyan
    };
    return colors[type] || '#6b7280';
  };

  const handleResetView = useCallback(() => {
    if (!analysis) return;
    
    // Recalculate layout
    const positions = calculateLayout(analysis.entities, analysis.relationships);
    
    // Update node positions
    const updatedNodes = nodes.map((node) => ({
      ...node,
      position: positions[node.id] || node.position
    }));
    
    setNodes(updatedNodes);
  }, [analysis, nodes, setNodes, calculateLayout]);

  return (
    <div className={`relative ${isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900' : 'h-[600px]'}`}>
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetView}
          className="bg-white dark:bg-gray-800"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="bg-white dark:bg-gray-800"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Legend & Stats */}
      <div className="absolute top-4 left-4 z-10 space-y-3">
        {/* Stats Card */}
        <Card className="p-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm">
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Graph Statistics</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Entities:</span>
                <span className="font-medium">{analysis.entities.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Relationships:</span>
                <span className="font-medium">{analysis.relationships.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Complexity:</span>
                <Badge variant={analysis.pattern_complexity === 'COMPLEX' ? 'destructive' : 'default'} className="text-xs h-4">
                  {analysis.pattern_complexity}
                </Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Legend Card */}
        <Card className="p-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm">
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Relationship Types</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-red-600"></div>
                <span>Causal</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-green-600"></div>
                <span>Therapeutic</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-blue-600"></div>
                <span>Associative</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-purple-600"></div>
                <span>Inhibitory</span>
              </div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Line thickness = relationship strength
            </div>
          </div>
        </Card>
      </div>

      {/* Graph */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-left"
        className="bg-gray-50 dark:bg-gray-900"
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={20} 
          className="bg-gray-50 dark:bg-gray-900"
        />
        <Controls 
          position="bottom-right"
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
        />
      </ReactFlow>
    </div>
  );
}