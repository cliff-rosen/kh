# Frontend Tool Browser Design

## Overview

This document outlines the frontend implementation for the new multi-dimensional tool categorization system, including UI components, navigation, and user experience improvements.

## Current Tool Browser Issues

1. **Single Category View**: Only shows functional categories
2. **No Domain Context**: Can't browse by domain (PubMed, Web, etc.)
3. **No Pipeline Understanding**: Users don't see tool relationships
4. **Limited Search**: Hard to find specific tools
5. **No Guided Experience**: No help for new users

## New Tool Browser Design

### Tab-Based Navigation

#### Primary Tabs (Domain-Based)
```jsx
<ToolBrowserTabs>
  <Tab value="all" label="All Tools" icon="apps" />
  <Tab value="academic_research" label="Academic Research" icon="book" />
  <Tab value="web_content" label="Web Content" icon="globe" />
  <Tab value="email_communication" label="Email & Communication" icon="mail" />
  <Tab value="general_purpose" label="General Purpose" icon="cog" />
</ToolBrowserTabs>
```

#### Secondary Filters (Functional)
```jsx
<FunctionalFilters>
  <FilterChip 
    value="search_retrieve" 
    label="Search & Retrieve" 
    icon="search" 
    active={filters.includes('search_retrieve')}
  />
  <FilterChip 
    value="extract_analyze" 
    label="Extract & Analyze" 
    icon="filter" 
    active={filters.includes('extract_analyze')}
  />
  <FilterChip 
    value="process_transform" 
    label="Process & Transform" 
    icon="transform" 
    active={filters.includes('process_transform')}
  />
  <FilterChip 
    value="score_rank" 
    label="Score & Rank" 
    icon="star" 
    active={filters.includes('score_rank')}
  />
</FunctionalFilters>
```

### Enhanced Tool Card

```jsx
<ToolCard className="tool-card">
  <ToolHeader>
    <ToolIcon 
      icon={tool.ui_metadata.icon} 
      color={tool.ui_metadata.color} 
    />
    <ToolTitle>{tool.name}</ToolTitle>
    <DifficultyBadge level={tool.ui_metadata.difficulty} />
  </ToolHeader>
  
  <ToolDescription>
    {tool.description}
  </ToolDescription>
  
  <ToolMetadata>
    <CategoryBadges>
      <FunctionalBadge category={tool.functional_category} />
      <DomainBadge category={tool.domain_category} />
    </CategoryBadges>
    
    <TagList>
      {tool.tags.map(tag => (
        <Tag key={tag} variant="outline">{tag}</Tag>
      ))}
    </TagList>
  </ToolMetadata>
  
  <ToolActions>
    <Button variant="primary" onClick={() => openTool(tool.id)}>
      Use Tool
    </Button>
    <Button variant="secondary" onClick={() => showToolDetails(tool.id)}>
      Details
    </Button>
  </ToolActions>
  
  {tool.pipeline_info.typical_next_tools.length > 0 && (
    <PipelineHint>
      <Text variant="small">Often used with:</Text>
      <NextToolsList tools={tool.pipeline_info.typical_next_tools} />
    </PipelineHint>
  )}
</ToolCard>
```

### Pipeline View Component

```jsx
<PipelineView pipeline="pubmed_research">
  <PipelineHeader>
    <PipelineTitle>PubMed Research Pipeline</PipelineTitle>
    <PipelineDescription>
      Complete workflow for academic literature research
    </PipelineDescription>
  </PipelineHeader>
  
  <PipelineFlow>
    <PipelineStep 
      tool="pubmed_generate_query" 
      optional={true}
      title="Generate Query"
      description="Create optimized search queries"
    />
    <PipelineArrow />
    <PipelineStep 
      tool="pubmed_search" 
      required={true}
      title="Search PubMed"
      description="Find relevant articles"
    />
    <PipelineArrow />
    <PipelineStep 
      tool="pubmed_extract_features" 
      required={true}
      title="Extract Features"
      description="Analyze article content"
    />
    <PipelineArrow />
    <PipelineStep 
      tool="pubmed_score_articles" 
      required={true}
      title="Score Articles"
      description="Evaluate article quality"
    />
    <PipelineArrow />
    <PipelineStep 
      tool="pubmed_filter_rank" 
      required={true}
      title="Filter & Rank"
      description="Get final results"
    />
  </PipelineFlow>
  
  <PipelineActions>
    <Button variant="primary" onClick={() => startPipeline('pubmed_research')}>
      Start Pipeline
    </Button>
    <Button variant="secondary" onClick={() => customizePipeline('pubmed_research')}>
      Customize
    </Button>
  </PipelineActions>
</PipelineView>
```

### Search and Filter Interface

```jsx
<ToolBrowserHeader>
  <SearchBar 
    placeholder="Search tools, tags, or descriptions..."
    value={searchQuery}
    onChange={setSearchQuery}
    onClear={() => setSearchQuery('')}
  />
  
  <ViewToggle>
    <ToggleButton 
      value="grid" 
      active={view === 'grid'}
      onClick={() => setView('grid')}
      icon="grid"
    />
    <ToggleButton 
      value="list" 
      active={view === 'list'}
      onClick={() => setView('list')}
      icon="list"
    />
    <ToggleButton 
      value="pipeline" 
      active={view === 'pipeline'}
      onClick={() => setView('pipeline')}
      icon="workflow"
    />
  </ViewToggle>
  
  <FilterDropdown>
    <FilterOption value="all">All Tools</FilterOption>
    <FilterOption value="beginner">Beginner Friendly</FilterOption>
    <FilterOption value="can_start">Can Start Pipeline</FilterOption>
    <FilterOption value="recently_used">Recently Used</FilterOption>
  </FilterDropdown>
</ToolBrowserHeader>
```

## Implementation Components

### 1. Enhanced ToolBrowser Component

```jsx
// frontend/src/components/features/tools/ToolBrowser.tsx
import React, { useState, useMemo } from 'react';
import { useTools } from '../../../hooks/useTools';

interface ToolBrowserProps {
  onToolSelect: (toolId: string) => void;
  onPipelineStart: (pipelineName: string) => void;
}

export const ToolBrowser: React.FC<ToolBrowserProps> = ({
  onToolSelect,
  onPipelineStart
}) => {
  const { tools, loading, error } = useTools();
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [functionalFilters, setFunctionalFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [view, setView] = useState<'grid' | 'list' | 'pipeline'>('grid');

  const filteredTools = useMemo(() => {
    return tools.filter(tool => {
      // Domain filter
      if (selectedDomain !== 'all' && tool.domain_category !== selectedDomain) {
        return false;
      }
      
      // Functional filters
      if (functionalFilters.length > 0 && !functionalFilters.includes(tool.functional_category)) {
        return false;
      }
      
      // Search query
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        return (
          tool.name.toLowerCase().includes(searchLower) ||
          tool.description.toLowerCase().includes(searchLower) ||
          tool.tags.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }
      
      return true;
    });
  }, [tools, selectedDomain, functionalFilters, searchQuery]);

  const pipelines = useMemo(() => {
    const pipelineMap = new Map();
    tools.forEach(tool => {
      const pipelineName = tool.pipeline_info.pipeline_name;
      if (!pipelineMap.has(pipelineName)) {
        pipelineMap.set(pipelineName, []);
      }
      pipelineMap.get(pipelineName).push(tool);
    });
    return Array.from(pipelineMap.entries());
  }, [tools]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div className="tool-browser">
      <ToolBrowserHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        view={view}
        onViewChange={setView}
        selectedDomain={selectedDomain}
        onDomainChange={setSelectedDomain}
        functionalFilters={functionalFilters}
        onFunctionalFiltersChange={setFunctionalFilters}
      />
      
      <ToolBrowserContent>
        {view === 'pipeline' ? (
          <PipelineGridView 
            pipelines={pipelines}
            onPipelineStart={onPipelineStart}
          />
        ) : (
          <ToolGridView 
            tools={filteredTools}
            view={view}
            onToolSelect={onToolSelect}
          />
        )}
      </ToolBrowserContent>
    </div>
  );
};
```

### 2. Pipeline Grid View

```jsx
// frontend/src/components/features/tools/PipelineGridView.tsx
import React from 'react';

interface PipelineGridViewProps {
  pipelines: Array<[string, Tool[]]>;
  onPipelineStart: (pipelineName: string) => void;
}

export const PipelineGridView: React.FC<PipelineGridViewProps> = ({
  pipelines,
  onPipelineStart
}) => {
  return (
    <div className="pipeline-grid">
      {pipelines.map(([pipelineName, tools]) => (
        <PipelineCard
          key={pipelineName}
          pipelineName={pipelineName}
          tools={tools}
          onStart={() => onPipelineStart(pipelineName)}
        />
      ))}
    </div>
  );
};
```

### 3. Tool Hook Enhancement

```jsx
// frontend/src/hooks/useTools.ts
import { useState, useEffect } from 'react';
import { toolsApi } from '../lib/api';

export const useTools = () => {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTools = async () => {
      try {
        setLoading(true);
        const response = await toolsApi.getAllTools();
        setTools(response.tools);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTools();
  }, []);

  const getToolsByDomain = (domain: string) => {
    return tools.filter(tool => tool.domain_category === domain);
  };

  const getToolsByFunction = (functionalCategory: string) => {
    return tools.filter(tool => tool.functional_category === functionalCategory);
  };

  const getPipelines = () => {
    const pipelineMap = new Map();
    tools.forEach(tool => {
      const pipelineName = tool.pipeline_info.pipeline_name;
      if (!pipelineMap.has(pipelineName)) {
        pipelineMap.set(pipelineName, []);
      }
      pipelineMap.get(pipelineName).push(tool);
    });
    return pipelineMap;
  };

  return {
    tools,
    loading,
    error,
    getToolsByDomain,
    getToolsByFunction,
    getPipelines
  };
};
```

## Backend API Enhancements

### New Endpoints

```python
# backend/routers/tools.py

@router.get("/tools/by-domain/{domain}")
async def get_tools_by_domain(domain: str):
    """Get tools filtered by domain category"""
    tools = get_available_tools()
    filtered_tools = [
        tool for tool in tools 
        if get_tool_definition(tool).domain_category == domain
    ]
    return {"tools": filtered_tools}

@router.get("/tools/by-function/{function}")
async def get_tools_by_function(function: str):
    """Get tools filtered by functional category"""
    tools = get_available_tools()
    filtered_tools = [
        tool for tool in tools 
        if get_tool_definition(tool).functional_category == function
    ]
    return {"tools": filtered_tools}

@router.get("/tools/pipelines")
async def get_pipelines():
    """Get all available tool pipelines"""
    tools = get_available_tools()
    pipelines = {}
    
    for tool_id in tools:
        tool_def = get_tool_definition(tool_id)
        pipeline_name = tool_def.pipeline_info.pipeline_name
        
        if pipeline_name not in pipelines:
            pipelines[pipeline_name] = []
        pipelines[pipeline_name].append(tool_def)
    
    return {"pipelines": pipelines}
```

## Migration Plan

### Phase 1: Backend Enhancement (Week 1)
- [ ] Update tools.json with new categorization fields
- [ ] Modify tool registry to handle new metadata
- [ ] Add new API endpoints
- [ ] Ensure backward compatibility

### Phase 2: Frontend Core (Week 2)
- [ ] Create enhanced ToolBrowser component
- [ ] Implement tab-based navigation
- [ ] Add search and filter functionality
- [ ] Update tool cards with new metadata

### Phase 3: Pipeline Features (Week 3)
- [ ] Implement pipeline view component
- [ ] Add pipeline flow visualization
- [ ] Create pipeline start/customize functionality
- [ ] Add tool relationship hints

### Phase 4: Advanced Features (Week 4)
- [ ] Add guided tool selection
- [ ] Implement tool recommendations
- [ ] Add user preferences/favorites
- [ ] Performance optimization

## Benefits Summary

1. **Better Discovery**: Users can find tools by domain, function, or pipeline
2. **Improved Understanding**: Clear tool relationships and workflows
3. **Enhanced UX**: Multiple viewing modes and intelligent filtering
4. **Scalable Design**: Easy to add new categories and tools
5. **Backward Compatible**: Existing functionality preserved

This design provides a modern, intuitive interface for tool discovery and selection while maintaining the flexibility to grow with the platform.