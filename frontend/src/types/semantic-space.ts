/**
 * Semantic Space types for Knowledge Horizon
 * Based on three-layer architecture: Layer 1 (Semantic Space) is the canonical,
 * source-agnostic representation of the information space the user cares about.
 */

// ============================================================================
// Enums
// ============================================================================

export enum EntityType {
    DISEASE = 'disease',
    SUBSTANCE = 'substance',
    CHEMICAL = 'chemical',
    ORGANIZATION = 'organization',
    REGULATION = 'regulation',
    STANDARD = 'standard',
    METHODOLOGY = 'methodology',
    BIOMARKER = 'biomarker',
    GEOGRAPHIC = 'geographic',
    POPULATION = 'population',
    DRUG = 'drug',
    GENE = 'gene',
    PROTEIN = 'protein',
    PATHWAY = 'pathway',
    THERAPY = 'therapy',
    DEVICE = 'device'
}

export enum RelationshipType {
    CAUSAL = 'causal',
    CORRELATIONAL = 'correlational',
    REGULATORY = 'regulatory',
    METHODOLOGICAL = 'methodological',
    TEMPORAL = 'temporal',
    HIERARCHICAL = 'hierarchical',
    THERAPEUTIC = 'therapeutic',
    INHIBITORY = 'inhibitory',
    INTERACTIVE = 'interactive'
}

export enum ImportanceLevel {
    CRITICAL = 'critical',
    IMPORTANT = 'important',
    RELEVANT = 'relevant'
}

export enum PriorityLevel {
    MUST_HAVE = 'must_have',
    SHOULD_HAVE = 'should_have',
    NICE_TO_HAVE = 'nice_to_have'
}

export type RelationshipStrength = 'strong' | 'moderate' | 'weak';
export type EdgeCaseResolution = 'include' | 'exclude' | 'conditional';
export type DerivationMethod = 'ai_generated' | 'manual' | 'hybrid';

// ============================================================================
// Core Semantic Elements
// ============================================================================

export interface Topic {
    topic_id: string;
    name: string;
    description: string;
    parent_topic?: string;
    importance: ImportanceLevel;
    rationale: string;
}

export interface Entity {
    entity_id: string;
    entity_type: EntityType;
    name: string;
    canonical_forms: string[];
    context: string;
}

export interface Relationship {
    relationship_id: string;
    type: RelationshipType;
    subject: string; // topic_id or entity_id
    object: string; // topic_id or entity_id
    description: string;
    strength: RelationshipStrength;
}

// ============================================================================
// Signal Types and Coverage
// ============================================================================

export interface SignalType {
    signal_id: string;
    name: string;
    description: string;
    priority: PriorityLevel;
    examples: string[];
}

export interface TemporalScope {
    start_date?: string; // YYYY-MM-DD or null
    end_date?: string; // Usually 'present'
    focus_periods: string[];
    recency_weight: number; // 0-1
    rationale: string;
}

export interface QualityCriteria {
    peer_review_required: boolean;
    minimum_citation_count?: number;
    journal_quality: string[];
    study_types: string[];
    exclude_predatory: boolean;
    language_restrictions: string[];
    other_criteria: string[];
}

// ============================================================================
// Boundaries
// ============================================================================

export interface InclusionCriterion {
    criterion_id: string;
    description: string;
    rationale: string;
    mandatory: boolean;
    related_topics: string[];
    related_entities: string[];
}

export interface ExclusionCriterion {
    criterion_id: string;
    description: string;
    rationale: string;
    strict: boolean;
    exceptions: string[];
}

export interface EdgeCase {
    case_id: string;
    description: string;
    resolution: EdgeCaseResolution;
    conditions?: string;
    rationale: string;
}

// ============================================================================
// Context and Metadata
// ============================================================================

export interface SemanticContext {
    business_context: string;
    decision_types: string[];
    stakeholders: string[];
    time_sensitivity: string;
}

export interface CoverageRequirements {
    signal_types: SignalType[];
    temporal_scope: TemporalScope;
    quality_criteria: QualityCriteria;
    completeness_requirement: string;
}

export interface Boundaries {
    inclusions: InclusionCriterion[];
    exclusions: ExclusionCriterion[];
    edge_cases: EdgeCase[];
}

export interface ExtractionMetadata {
    extracted_from: string;
    extracted_at: string;
    confidence_score?: number; // 0-1
    human_reviewed: boolean;
    review_notes?: string;
    derivation_method: DerivationMethod;
}

export interface Domain {
    name: string;
    description: string;
}

// ============================================================================
// Main Semantic Space Interface
// ============================================================================

export interface SemanticSpace {
    // Core identification
    domain: Domain;

    // What: Topics, Entities, Concepts
    topics: Topic[];
    entities: Entity[];
    relationships: Relationship[];

    // Why: Context and Purpose
    context: SemanticContext;

    // How: Coverage Requirements
    coverage: CoverageRequirements;

    // Boundaries: What's In/Out
    boundaries: Boundaries;

    // Metadata
    extraction_metadata: ExtractionMetadata;
}

// ============================================================================
// Helper/Utility Types
// ============================================================================

export interface SemanticSpaceValidation {
    is_complete: boolean;
    missing_fields: string[];
    warnings: string[];
    coverage_score: number; // 0-1
}

export interface SemanticSpaceSummary {
    domain_name: string;
    topic_count: number;
    entity_count: number;
    relationship_count: number;
    has_quality_criteria: boolean;
    has_temporal_scope: boolean;
    inclusion_count: number;
    exclusion_count: number;
}
