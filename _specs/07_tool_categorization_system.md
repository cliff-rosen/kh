# Multi-Dimensional Tool Categorization System

## Overview

This document defines a new multi-dimensional categorization system for tools that enables better user browsing and discovery through both functional and domain-based organization.

## Current Problems

1. **Single Dimension**: Current categorization only uses functional categories (data_retrieval, data_processing, data_analysis)
2. **Poor Discoverability**: Users can't easily find tools by domain (e.g., "show me all PubMed tools")
3. **No Pipeline Context**: Hard to understand which tools work together
4. **Limited Browsing**: Frontend tool browser needs better organization

## Proposed Solution

### Two-Dimensional Categorization System

#### Dimension 1: Functional Categories
- **Search & Retrieve**: Find and fetch data from external sources
- **Extract & Analyze**: Extract structured information and analyze content
- **Process & Transform**: Transform, summarize, and manipulate data
- **Score & Rank**: Evaluate, score, and rank results

#### Dimension 2: Domain Categories
- **Academic Research**: PubMed and scholarly content
- **Web Content**: Web search and webpage retrieval
- **Email & Communication**: Email processing and communication tools
- **General Purpose**: Domain-agnostic tools

### Enhanced Metadata Structure

```json
{
  "id": "tool_id",
  "name": "tool_name",
  "description": "tool description",
  "category": "data_retrieval", // Keep for backward compatibility
  "functional_category": "search_retrieve",
  "domain_category": "academic_research",
  "tags": ["search", "research", "api"],
  "pipeline_info": {
    "can_start_pipeline": true,
    "typical_next_tools": ["pubmed_extract_features"],
    "pipeline_name": "pubmed_research"
  },
  "ui_metadata": {
    "icon": "search",
    "color": "blue",
    "difficulty": "beginner"
  }
}
```

## Tool Categorization Matrix

| Tool | Functional | Domain | Pipeline | Tags |
|------|------------|--------|----------|------|
| `email_search` | search_retrieve | email_communication | email_analysis | search, email, gmail |
| `web_search` | search_retrieve | web_content | web_research | search, web, real-time |
| `web_retrieve` | search_retrieve | web_content | web_research | retrieve, web, content |
| `pubmed_search` | search_retrieve | academic_research | pubmed_research | search, pubmed, academic |
| `pubmed_generate_query` | process_transform | academic_research | pubmed_research | query, generate, optimization |
| `extract` | extract_analyze | general_purpose | content_analysis | extract, llm, flexible |
| `summarize` | process_transform | general_purpose | content_analysis | summarize, llm, text |
| `pubmed_extract_features` | extract_analyze | academic_research | pubmed_research | extract, research, features |
| `group_reduce` | process_transform | general_purpose | data_analysis | group, aggregate, analyze |
| `pubmed_score_articles` | score_rank | academic_research | pubmed_research | score, rank, evaluate |
| `pubmed_filter_rank` | score_rank | academic_research | pubmed_research | filter, rank, results |

## Frontend Implementation

### Tab-Based Tool Browser

#### Primary Tabs (Domain-Based)
1. **All Tools** - Show all tools with search/filter
2. **Academic Research** - PubMed and scholarly tools
3. **Web Content** - Web search and retrieval tools
4. **Email & Communication** - Email processing tools
5. **General Purpose** - Domain-agnostic tools

#### Secondary Filters (Functional)
Within each domain tab, show functional category filters:
- Search & Retrieve
- Extract & Analyze  
- Process & Transform
- Score & Rank

#### Pipeline View
Special view showing tools grouped by pipeline:
- **PubMed Research Pipeline**: query generation → search → extract → score → rank
- **Web Research Pipeline**: web search → retrieve → extract → summarize
- **Email Analysis Pipeline**: email search → extract → group → summarize

### UI Components

#### Tool Card Design
```jsx
<ToolCard>
  <ToolIcon icon={tool.ui_metadata.icon} color={tool.ui_metadata.color} />
  <ToolTitle>{tool.name}</ToolTitle>
  <ToolDescription>{tool.description}</ToolDescription>
  <ToolTags tags={tool.tags} />
  <ToolCategories>
    <FunctionalBadge>{tool.functional_category}</FunctionalBadge>
    <DomainBadge>{tool.domain_category}</DomainBadge>
  </ToolCategories>
  <DifficultyIndicator level={tool.ui_metadata.difficulty} />
</ToolCard>
```

#### Pipeline Flow View
```jsx
<PipelineView pipeline="pubmed_research">
  <PipelineStep tool="pubmed_generate_query" optional />
  <PipelineArrow />
  <PipelineStep tool="pubmed_search" required />
  <PipelineArrow />
  <PipelineStep tool="pubmed_extract_features" required />
  <PipelineArrow />
  <PipelineStep tool="pubmed_score_articles" required />
  <PipelineArrow />
  <PipelineStep tool="pubmed_filter_rank" required />
</PipelineView>
```

## Implementation Plan

### Phase 1: Update Tool Metadata
1. Add new categorization fields to tools.json
2. Update tool registry to handle new metadata
3. Ensure backward compatibility with existing category field

### Phase 2: Backend API Updates
1. Add new filtering endpoints:
   - `/api/tools/by-domain/{domain}`
   - `/api/tools/by-function/{function}`
   - `/api/tools/pipelines`
2. Update existing tool listing APIs

### Phase 3: Frontend Tool Browser
1. Implement tab-based interface
2. Add functional category filters
3. Create pipeline view component
4. Update tool cards with new metadata

### Phase 4: Enhanced Features
1. Tool recommendation system
2. Pipeline builder interface
3. Guided tool selection wizard
4. Integration with workflow builder

## Benefits

1. **Better Discovery**: Users can find tools by domain or function
2. **Pipeline Clarity**: Clear understanding of tool relationships
3. **Improved UX**: Multiple browsing modes (domain, function, pipeline)
4. **Scalability**: Easy to add new domains and functional categories
5. **Backward Compatible**: Existing systems continue to work

## Future Extensions

1. **Skill-Based Categories**: Beginner, Intermediate, Advanced
2. **Performance Categories**: Fast, Standard, Intensive
3. **Data Type Categories**: Text, Structured, Binary
4. **Integration Categories**: API, File, Database
5. **Custom User Categories**: Allow users to create custom groupings

This system provides a flexible, scalable foundation for tool organization that grows with the platform.