# Concept Relationship Schema Proposal

## Design Principles

Based on decisions:
1. **Both machine-parseable AND human-readable** - Two separate fields for different purposes
2. **Semantic space relationships are "soft"** - Optional hints/context for LLM
3. **Concept relationships are "rigorous"** - Validated, precise graph structures

---

## Schema Design

### New Pydantic Models

```python
class RelationshipEdge(BaseModel):
    """A directed edge in the concept's entity relationship graph"""
    from_entity_id: str = Field(
        description="Source entity_id from entity_pattern"
    )
    to_entity_id: str = Field(
        description="Target entity_id from entity_pattern"
    )
    relation_type: str = Field(
        description="Type of relationship (e.g., 'causes', 'measures', 'detects', 'treats', 'induces')"
    )

class Concept(BaseModel):
    """
    A searchable entity-relationship pattern that covers one or more topics.
    """
    concept_id: str
    name: str

    # Entity pattern (1-3 entities)
    entity_pattern: List[str] = Field(
        min_items=1,
        max_items=3,
        description="List of entity_ids that form this pattern"
    )

    # RIGOROUS relationship graph (machine-parseable)
    relationship_edges: List[RelationshipEdge] = Field(
        description="Directed edges defining how entities connect in the graph"
    )

    # HUMAN-READABLE relationship description
    relationship_description: str = Field(
        description="Natural language description of the entity relationships for human understanding"
    )

    # Coverage
    covered_topics: List[str]

    # Vocabulary expansion
    vocabulary_terms: Dict[str, List[str]]

    # Volume tracking
    expected_volume: Optional[int] = None
    volume_status: VolumeStatus = VolumeStatus.UNKNOWN
    last_volume_check: Optional[datetime] = None

    # Queries per source
    source_queries: Dict[str, SourceQuery] = Field(default_factory=dict)

    # Semantic filtering
    semantic_filter: SemanticFilter = Field(default_factory=lambda: SemanticFilter())

    # Exclusions
    exclusions: List[str] = Field(default_factory=list)
    exclusion_rationale: Optional[str] = None

    # Metadata
    rationale: str
    human_edited: bool = False
```

---

## Validation Rules

### Graph Connectivity Requirements

For a valid concept:

1. **Minimum edges**: `len(relationship_edges) >= len(entity_pattern) - 1`
   - 1 entity: 0 edges
   - 2 entities: ≥1 edge
   - 3 entities: ≥2 edges

2. **Entity references**: All `from_entity_id` and `to_entity_id` must exist in `entity_pattern`

3. **No self-loops**: `from_entity_id != to_entity_id`

4. **Connected graph**: Must be able to reach all entities from edges (graph is connected)

### Validation Implementation

```python
def validate_concept_relationships(concept: Concept, semantic_space: SemanticSpace) -> List[str]:
    """
    Validate concept relationship graph.

    Returns list of validation errors (empty if valid).
    """
    errors = []

    # Check minimum edges
    min_edges = len(concept.entity_pattern) - 1
    if len(concept.relationship_edges) < min_edges:
        errors.append(
            f"Concept has {len(concept.entity_pattern)} entities but only "
            f"{len(concept.relationship_edges)} edges. Need at least {min_edges} edges."
        )

    # Check all entity_ids are valid
    valid_entity_ids = {e.entity_id for e in semantic_space.entities}
    for entity_id in concept.entity_pattern:
        if entity_id not in valid_entity_ids:
            errors.append(f"Invalid entity_id in pattern: {entity_id}")

    # Check edge references
    pattern_set = set(concept.entity_pattern)
    for edge in concept.relationship_edges:
        if edge.from_entity_id not in pattern_set:
            errors.append(f"Edge references unknown entity: {edge.from_entity_id}")
        if edge.to_entity_id not in pattern_set:
            errors.append(f"Edge references unknown entity: {edge.to_entity_id}")
        if edge.from_entity_id == edge.to_entity_id:
            errors.append(f"Self-loop not allowed: {edge.from_entity_id} -> {edge.to_entity_id}")

    # Check graph connectivity (all entities reachable)
    if len(concept.entity_pattern) > 1 and len(concept.relationship_edges) > 0:
        connected = check_graph_connected(concept.entity_pattern, concept.relationship_edges)
        if not connected:
            errors.append("Graph is not connected - some entities are unreachable")

    return errors

def check_graph_connected(entities: List[str], edges: List[RelationshipEdge]) -> bool:
    """Check if undirected graph formed by edges is connected"""
    if len(entities) <= 1:
        return True

    # Build adjacency list (treat as undirected)
    adj = {e: set() for e in entities}
    for edge in edges:
        adj[edge.from_entity_id].add(edge.to_entity_id)
        adj[edge.to_entity_id].add(edge.from_entity_id)

    # BFS from first entity
    visited = set()
    queue = [entities[0]]
    visited.add(entities[0])

    while queue:
        node = queue.pop(0)
        for neighbor in adj[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    return len(visited) == len(entities)
```

---

## Examples

### Example 1: Two-Entity Concept (Single Edge)

```json
{
  "concept_id": "c1",
  "name": "Asbestos-induced mesothelioma",
  "entity_pattern": ["e1", "e2"],

  "relationship_edges": [
    {
      "from_entity_id": "e1",
      "to_entity_id": "e2",
      "relation_type": "causes"
    }
  ],

  "relationship_description": "Asbestos exposure causes mesothelioma through fiber-induced cellular damage and chronic inflammation",

  "covered_topics": ["t1", "t2"],
  "vocabulary_terms": {
    "e1": ["asbestos", "asbestos fiber", "asbestos exposure"],
    "e2": ["mesothelioma", "pleural mesothelioma", "malignant mesothelioma"]
  },
  "rationale": "Captures the well-established causal relationship between asbestos exposure and mesothelioma development"
}
```

**Graph visualization**: `e1 --[causes]--> e2`

---

### Example 2: Three-Entity Linear Chain

```json
{
  "concept_id": "c2",
  "name": "Liquid biopsy ctDNA detection for lung cancer",
  "entity_pattern": ["e3", "e4", "e5"],

  "relationship_edges": [
    {
      "from_entity_id": "e3",
      "to_entity_id": "e4",
      "relation_type": "measures"
    },
    {
      "from_entity_id": "e4",
      "to_entity_id": "e5",
      "relation_type": "detects"
    }
  ],

  "relationship_description": "Liquid biopsy techniques measure circulating tumor DNA levels, which can detect the presence of lung cancer",

  "covered_topics": ["t3"],
  "vocabulary_terms": {
    "e3": ["liquid biopsy", "blood biopsy", "plasma testing"],
    "e4": ["ctDNA", "circulating tumor DNA", "cell-free DNA"],
    "e5": ["lung cancer", "NSCLC", "non-small cell lung cancer"]
  },
  "rationale": "Captures the complete methodological pathway from technique to biomarker to disease detection"
}
```

**Graph visualization**: `e3 --[measures]--> e4 --[detects]--> e5`

---

### Example 3: Three-Entity Convergent Pattern

```json
{
  "concept_id": "c3",
  "name": "Smoking and asbestos synergistic mesothelioma risk",
  "entity_pattern": ["e6", "e7", "e2"],

  "relationship_edges": [
    {
      "from_entity_id": "e6",
      "to_entity_id": "e2",
      "relation_type": "increases_risk"
    },
    {
      "from_entity_id": "e7",
      "to_entity_id": "e2",
      "relation_type": "causes"
    }
  ],

  "relationship_description": "Both smoking and asbestos exposure contribute to mesothelioma development, with smoking increasing the risk from asbestos exposure",

  "covered_topics": ["t4"],
  "vocabulary_terms": {
    "e6": ["smoking", "tobacco smoke", "cigarette smoking"],
    "e7": ["asbestos", "asbestos exposure", "occupational asbestos"],
    "e2": ["mesothelioma", "pleural mesothelioma"]
  },
  "rationale": "Captures the convergent risk factors for mesothelioma where multiple exposures impact disease development"
}
```

**Graph visualization**:
```
e6 --[increases_risk]--> e2 <--[causes]-- e7
```

---

### Example 4: Three-Entity Mediator Pattern

```json
{
  "concept_id": "c4",
  "name": "Asbestos-inflammation-mesothelioma pathway",
  "entity_pattern": ["e1", "e8", "e2"],

  "relationship_edges": [
    {
      "from_entity_id": "e1",
      "to_entity_id": "e8",
      "relation_type": "induces"
    },
    {
      "from_entity_id": "e8",
      "to_entity_id": "e2",
      "relation_type": "leads_to"
    }
  ],

  "relationship_description": "Asbestos exposure induces chronic inflammatory responses, which lead to mesothelioma through sustained tissue damage and cellular transformation",

  "covered_topics": ["t5"],
  "vocabulary_terms": {
    "e1": ["asbestos", "asbestos fiber"],
    "e8": ["inflammation", "inflammatory response", "chronic inflammation"],
    "e2": ["mesothelioma", "malignant mesothelioma"]
  },
  "rationale": "Captures the mechanistic pathway where inflammation mediates between asbestos exposure and disease development"
}
```

**Graph visualization**: `e1 --[induces]--> e8 --[leads_to]--> e2`

---

## LLM Response Schema

The LLM must generate concepts with this structure:

```json
{
  "type": "object",
  "properties": {
    "phase1_analysis": { "..." },
    "concepts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "concept_id": {"type": "string"},
          "name": {"type": "string"},
          "entity_pattern": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "maxItems": 3
          },
          "relationship_edges": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "from_entity_id": {"type": "string"},
                "to_entity_id": {"type": "string"},
                "relation_type": {"type": "string"}
              },
              "required": ["from_entity_id", "to_entity_id", "relation_type"]
            }
          },
          "relationship_description": {"type": "string"},
          "covered_topics": {
            "type": "array",
            "items": {"type": "string"}
          },
          "rationale": {"type": "string"}
        },
        "required": [
          "concept_id",
          "name",
          "entity_pattern",
          "relationship_edges",
          "relationship_description",
          "covered_topics",
          "rationale"
        ]
      }
    },
    "overall_reasoning": {"type": "string"}
  },
  "required": ["phase1_analysis", "concepts", "overall_reasoning"]
}
```

---

## Usage in Query Generation

When generating queries, use `relationship_description` as context:

```python
user_prompt = f"""
ENTITY PATTERN (with vocabulary expansion):
{entity_descriptions}

RELATIONSHIP: {concept.relationship_description}

COVERED TOPICS: {topics_list}

Create a {source} query that captures this entity-relationship pattern.
"""
```

The machine-parseable `relationship_edges` can be used for:
- Validation
- Graph visualization
- Advanced query optimization (future)
- Debugging and quality checks

---

## Frontend Visualization

The frontend can now properly visualize any graph structure:

```tsx
function RelationshipGraphVisualization({ concept, semanticSpace }) {
  const getEntityName = (id) =>
    semanticSpace.entities.find(e => e.entity_id === id)?.name || id;

  // Detect topology
  const topology = detectTopology(concept.relationship_edges);

  if (topology === 'linear_chain') {
    return (
      <div className="flex items-center gap-2">
        {concept.entity_pattern.map((entityId, i) => (
          <>
            <EntityBadge name={getEntityName(entityId)} />
            {i < concept.entity_pattern.length - 1 && (
              <Arrow label={concept.relationship_edges[i].relation_type} />
            )}
          </>
        ))}
      </div>
    );
  }

  if (topology === 'convergent') {
    // Render convergent pattern
  }

  // ... other topologies
}
```

---

## Migration Path

### Phase 1: Update Schema
- Add `relationship_edges: List[RelationshipEdge]`
- Add `relationship_description: str`
- Keep `relationship_pattern` for backward compatibility (deprecated)

### Phase 2: Update LLM Prompts
- Ask LLM to generate both edges and description
- Add validation in parsing

### Phase 3: Update Frontend
- Parse edges to visualize graph
- Display description as human-readable text

### Phase 4: Remove Old Field
- Drop `relationship_pattern` after migration complete

---

## Summary

**Key Benefits**:
1. **Rigorous validation** - Can verify graph connectivity and structure
2. **Clear semantics** - Machine and humans understand different aspects
3. **Flexible visualization** - Can render any graph topology accurately
4. **Quality control** - Human reviewers see clear descriptions
5. **Future-proof** - Can add graph analysis, optimization, etc.

**Tradeoff**:
- More complex schema (but necessary for rigor)
- LLM must generate more structured output (but validates correctness)
