import React, { useState, useEffect, useMemo } from 'react';
import { ToolDefinition } from '@/types/tool';
import { toolsApi } from '@/lib/api/toolsApi';
import { VariableRenderer } from '@/components/common/VariableRenderer';
import { SchemaRenderer } from '@/components/common';
import {
    Search,
    Filter,
    Code,
    Database,
    Globe,
    FileText,
    BarChart3,
    Settings,
    ChevronRight,
    AlertCircle,
    RefreshCw,
    CheckCircle,
    Info,
    Mail,
    Book,
    Download,
    Microscope,
    Lightbulb,
    FileText as Document,
    BarChart3 as Chart,
    Star,
    Filter as Funnel,
    Grid,
    List,
    Workflow,
    ArrowRight
} from 'lucide-react';

interface ToolBrowserProps {
    className?: string;
    onSelectTool: (tool: ToolDefinition | null) => void;
}

export const ToolBrowser: React.FC<ToolBrowserProps> = ({ className = '', onSelectTool }) => {
    const [tools, setTools] = useState<ToolDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDomain, setSelectedDomain] = useState<string>('all');
    const [functionalFilters, setFunctionalFilters] = useState<string[]>([]);
    const [view, setView] = useState<'grid' | 'list' | 'pipeline'>('grid');
    const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);

    // Fetch tools on component mount
    useEffect(() => {
        const fetchTools = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await toolsApi.getTools();
                const tools = response.tools || [];
                console.log('Tools API response:', response);
                console.log('Number of tools:', tools.length);
                if (tools.length > 0) {
                    console.log('First tool sample:', {
                        name: tools[0].name,
                        functional_category: tools[0].functional_category,
                        domain_category: tools[0].domain_category,
                        tags: tools[0].tags
                    });
                }
                setTools(tools);
            } catch (err) {
                setError('Failed to fetch tools');
                console.error('Error fetching tools:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchTools();
    }, []);

    // Get domain categories with counts
    const domainCategories = useMemo(() => {
        const domainMap = new Map<string, number>();
        tools.forEach(tool => {
            const domain = tool.domain_category || 'general_purpose';
            domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
        });

        console.log('Domain categorization:', {
            domainMap: Object.fromEntries(domainMap),
            totalTools: tools.length
        });

        return [
            { value: 'all', label: 'All Tools', count: tools.length, icon: 'grid' },
            { value: 'academic_research', label: 'Academic Research', count: domainMap.get('academic_research') || 0, icon: 'book' },
            { value: 'web_content', label: 'Web Content', count: domainMap.get('web_content') || 0, icon: 'globe' },
            { value: 'email_communication', label: 'Email & Communication', count: domainMap.get('email_communication') || 0, icon: 'mail' },
            { value: 'general_purpose', label: 'General Purpose', count: domainMap.get('general_purpose') || 0, icon: 'code' }
        ].filter(category => category.value === 'all' || category.count > 0);
    }, [tools]);

    // Get functional categories
    const functionalCategories = useMemo(() => {
        return [
            { value: 'search_retrieve', label: 'Search & Retrieve', icon: 'search' },
            { value: 'extract_analyze', label: 'Extract & Analyze', icon: 'filter' },
            { value: 'process_transform', label: 'Process & Transform', icon: 'code' },
            { value: 'score_rank', label: 'Score & Rank', icon: 'star' }
        ];
    }, []);

    // Get pipelines
    const pipelines = useMemo(() => {
        const pipelineMap = new Map<string, ToolDefinition[]>();
        tools.forEach(tool => {
            const pipelineName = tool.pipeline_info?.pipeline_name || 'standalone';
            if (!pipelineMap.has(pipelineName)) {
                pipelineMap.set(pipelineName, []);
            }
            pipelineMap.get(pipelineName)!.push(tool);
        });
        return Array.from(pipelineMap.entries()).filter(([name]) => name !== 'standalone');
    }, [tools]);

    // Filter tools based on search, domain, and functional filters
    const filteredTools = useMemo(() => {
        return tools.filter(tool => {
            // Domain filter
            const toolDomain = tool.domain_category || 'general_purpose';
            if (selectedDomain !== 'all' && toolDomain !== selectedDomain) {
                return false;
            }
            
            // Functional filters
            if (functionalFilters.length > 0) {
                const toolFunctional = tool.functional_category;
                if (!toolFunctional || !functionalFilters.includes(toolFunctional)) {
                    return false;
                }
            }
            
            // Search query
            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                const matches = (
                    tool.name.toLowerCase().includes(searchLower) ||
                    tool.description.toLowerCase().includes(searchLower) ||
                    tool.id.toLowerCase().includes(searchLower) ||
                    (tool.tags && tool.tags.some(tag => tag.toLowerCase().includes(searchLower)))
                );
                if (!matches) {
                    return false;
                }
            }
            
            return true;
        });
    }, [tools, selectedDomain, functionalFilters, searchTerm]);

    // Get tool icon from UI metadata or fallback to category
    const getToolIcon = (tool: ToolDefinition) => {
        const iconClass = "w-4 h-4";
        
        // Use ui_metadata icon if available
        if (tool.ui_metadata?.icon) {
            switch (tool.ui_metadata.icon.toLowerCase()) {
                case 'mail': return <Mail className={iconClass} />;
                case 'search': return <Search className={iconClass} />;
                case 'download': return <Download className={iconClass} />;
                case 'book': return <Book className={iconClass} />;
                case 'filter': return <Filter className={iconClass} />;
                case 'document': return <Document className={iconClass} />;
                case 'lightbulb': return <Lightbulb className={iconClass} />;
                case 'microscope': return <Microscope className={iconClass} />;
                case 'chart': return <Chart className={iconClass} />;
                case 'star': return <Star className={iconClass} />;
                case 'funnel': return <Funnel className={iconClass} />;
                default: return <Code className={iconClass} />;
            }
        }
        
        // Fallback to category icon
        return getCategoryIcon(tool.category);
    };

    // Get category icon
    const getCategoryIcon = (category: string) => {
        const iconClass = "w-4 h-4";
        switch (category.toLowerCase()) {
            case 'data_retrieval':
                return <Database className={iconClass} />;
            case 'data_processing':
                return <BarChart3 className={iconClass} />;
            case 'data_analysis':
                return <BarChart3 className={iconClass} />;
            case 'web':
                return <Globe className={iconClass} />;
            case 'file':
                return <FileText className={iconClass} />;
            case 'system':
                return <Settings className={iconClass} />;
            default:
                return <Code className={iconClass} />;
        }
    };

    // Get domain icon
    const getDomainIcon = (iconName: string) => {
        const iconClass = "w-4 h-4";
        switch (iconName.toLowerCase()) {
            case 'book': return <Book className={iconClass} />;
            case 'globe': return <Globe className={iconClass} />;
            case 'mail': return <Mail className={iconClass} />;
            case 'code': return <Code className={iconClass} />;
            case 'grid': return <Grid className={iconClass} />;
            default: return <Code className={iconClass} />;
        }
    };

    // Get functional icon
    const getFunctionalIcon = (iconName: string) => {
        const iconClass = "w-4 h-4";
        switch (iconName.toLowerCase()) {
            case 'search': return <Search className={iconClass} />;
            case 'filter': return <Filter className={iconClass} />;
            case 'code': return <Code className={iconClass} />;
            case 'star': return <Star className={iconClass} />;
            default: return <Code className={iconClass} />;
        }
    };

    // Toggle functional filter
    const toggleFunctionalFilter = (filter: string) => {
        setFunctionalFilters(prev => 
            prev.includes(filter) 
                ? prev.filter(f => f !== filter)
                : [...prev, filter]
        );
    };

    const handleSelectTool = (tool: ToolDefinition) => {
        setSelectedTool(tool);
        onSelectTool(tool);
    };

    const handleRefresh = () => {
        setTools([]);
        setSelectedTool(null);
        setLoading(true);
        setError(null);
    };

    // Loading state
    if (loading) {
        return (
            <div className={`flex items-center justify-center p-8 ${className}`}>
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading tools...
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className={`p-4 ${className}`}>
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-4">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
                <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className={`h-full flex flex-col ${className}`}>
            {/* Header with Search and View Controls */}
            <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex gap-3 mb-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search tools, tags, or descriptions..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white text-sm"
                        />
                    </div>
                    
                    {/* View Toggle */}
                    <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg">
                        <button
                            onClick={() => setView('grid')}
                            className={`p-2 rounded-l-lg transition-colors ${view === 'grid' 
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                            title="Grid view"
                        >
                            <Grid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setView('list')}
                            className={`p-2 border-l border-r border-gray-300 dark:border-gray-600 transition-colors ${view === 'list' 
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                            title="List view"
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setView('pipeline')}
                            className={`p-2 rounded-r-lg transition-colors ${view === 'pipeline' 
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                            title="Pipeline view"
                        >
                            <Workflow className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <button
                        onClick={handleRefresh}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        title="Refresh tools"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {/* Domain Tabs */}
                <div className="flex gap-1 mb-4">
                    {domainCategories.map(domain => (
                        <button
                            key={domain.value}
                            onClick={() => setSelectedDomain(domain.value)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                selectedDomain === domain.value
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                        >
                            {getDomainIcon(domain.icon)}
                            <span>{domain.label}</span>
                            <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                                {domain.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Functional Filters */}
                <div className="flex gap-2 mb-4">
                    {functionalCategories.map(category => (
                        <button
                            key={category.value}
                            onClick={() => toggleFunctionalFilter(category.value)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                functionalFilters.includes(category.value)
                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            {getFunctionalIcon(category.icon)}
                            <span>{category.label}</span>
                        </button>
                    ))}
                </div>

                {/* Results count */}
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>
                        {filteredTools.length} of {tools.length} tools
                        {selectedTool && (
                            <span className="ml-2 text-blue-600 dark:text-blue-400">
                                • {selectedTool.name} selected
                            </span>
                        )}
                    </span>
                    {functionalFilters.length > 0 && (
                        <button
                            onClick={() => setFunctionalFilters([])}
                            className="text-purple-600 dark:text-purple-400 hover:underline text-sm"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {view === 'pipeline' ? (
                    <div className="h-full overflow-y-auto p-4">
                        <div className="space-y-6">
                            {pipelines.map(([pipelineName, pipelineTools]) => (
                                <div key={pipelineName} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                        {pipelineName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Pipeline
                                    </h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                        {pipelineTools.length} tools in this workflow
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {pipelineTools
                                            .sort((a) => (a.pipeline_info?.can_start_pipeline ? -1 : 1))
                                            .map((tool, index) => (
                                                <React.Fragment key={tool.id}>
                                                    <div
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                                                            selectedTool?.id === tool.id
                                                                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600'
                                                                : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                                                        }`}
                                                        onClick={() => handleSelectTool(tool)}
                                                    >
                                                        {getToolIcon(tool)}
                                                        <span className="text-sm font-medium">
                                                            {tool.name}
                                                        </span>
                                                        {tool.pipeline_info?.can_start_pipeline && (
                                                            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                                                                Start
                                                            </span>
                                                        )}
                                                    </div>
                                                    {index < pipelineTools.length - 1 && (
                                                        <ArrowRight className="w-4 h-4 text-gray-400" />
                                                    )}
                                                </React.Fragment>
                                            ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : view === 'list' ? (
                    <div className="h-full overflow-y-auto">
                        {/* List View - Full Width Compact List */}
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredTools.length === 0 ? (
                                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                                    <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p className="text-lg mb-2">No tools found matching your criteria</p>
                                    {searchTerm && (
                                        <button
                                            onClick={() => setSearchTerm('')}
                                            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                                        >
                                            Clear search
                                        </button>
                                    )}
                                </div>
                            ) : (
                                filteredTools.map(tool => (
                                    <div
                                        key={tool.id}
                                        className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-all duration-200 ${
                                            selectedTool?.id === tool.id
                                                ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500'
                                                : 'border-l-4 border-transparent'
                                        }`}
                                        onClick={() => handleSelectTool(tool)}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className={`mt-1 transition-colors ${selectedTool?.id === tool.id
                                                ? 'text-blue-600 dark:text-blue-400'
                                                : 'text-gray-400 dark:text-gray-500'
                                                }`}>
                                                {getToolIcon(tool)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <h3 className={`text-base font-medium ${selectedTool?.id === tool.id
                                                            ? 'text-blue-900 dark:text-blue-100'
                                                            : 'text-gray-900 dark:text-gray-100'
                                                            }`}>
                                                            {tool.name}
                                                        </h3>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                                                            {tool.description}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                                                        {tool.ui_metadata?.difficulty && (
                                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                                                tool.ui_metadata.difficulty === 'beginner' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                                                                tool.ui_metadata.difficulty === 'intermediate' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                                                                'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                                            }`}>
                                                                {tool.ui_metadata.difficulty}
                                                            </span>
                                                        )}
                                                        {tool.pipeline_info?.can_start_pipeline && (
                                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                                                Pipeline Start
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 mt-3 flex-wrap">
                                                    {tool.functional_category && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                                                            {tool.functional_category.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                    {tool.domain_category && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                                            {tool.domain_category.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                    {tool.tags && tool.tags.slice(0, 4).map(tag => (
                                                        <span key={tag} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                    {tool.tags && tool.tags.length > 4 && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                            +{tool.tags.length - 4} more
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full">
                        {/* Grid View - Tool List */}
                        <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
                            <div className="p-2">
                                {filteredTools.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                        <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p>No tools found matching your criteria</p>
                                        {searchTerm && (
                                            <button
                                                onClick={() => setSearchTerm('')}
                                                className="text-blue-600 dark:text-blue-400 hover:underline text-sm mt-2"
                                            >
                                                Clear search
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    filteredTools.map(tool => (
                                        <div
                                            key={tool.id}
                                            className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition-all duration-200 cursor-pointer group ${selectedTool?.id === tool.id
                                                ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 shadow-sm'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-l-4 border-transparent'
                                                }`}
                                            onClick={() => handleSelectTool(tool)}
                                        >
                                            <div className={`transition-colors ${selectedTool?.id === tool.id
                                                ? 'text-blue-600 dark:text-blue-400'
                                                : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'
                                                }`}>
                                                {getToolIcon(tool)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <h3 className={`text-sm font-medium truncate ${selectedTool?.id === tool.id
                                                        ? 'text-blue-900 dark:text-blue-100'
                                                        : 'text-gray-900 dark:text-gray-100'
                                                        }`}>
                                                        {tool.name}
                                                    </h3>
                                                    <ChevronRight className={`w-4 h-4 transition-transform ${selectedTool?.id === tool.id
                                                        ? 'rotate-90 text-blue-600 dark:text-blue-400'
                                                        : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'
                                                        }`} />
                                                </div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                                    {tool.description}
                                                </p>
                                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                    {tool.functional_category && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                                                            {tool.functional_category.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                    {tool.domain_category && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                                            {tool.domain_category.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                    {tool.ui_metadata?.difficulty && (
                                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                                            tool.ui_metadata.difficulty === 'beginner' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                                                            tool.ui_metadata.difficulty === 'intermediate' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                                                            'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                                        }`}>
                                                            {tool.ui_metadata.difficulty}
                                                        </span>
                                                    )}
                                                    {tool.tags && tool.tags.length > 0 && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                            {tool.tags.slice(0, 2).join(', ')}
                                                            {tool.tags.length > 2 && '...'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Tool Details */}
                        <div className="w-2/3 overflow-y-auto">
                            {selectedTool ? (
                                <div className="p-4">
                                    {/* Tool Header */}
                                    <div className="mb-6">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="text-blue-600 dark:text-blue-400">
                                                {getToolIcon(selectedTool)}
                                            </div>
                                            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                                {selectedTool.name}
                                            </h3>
                                        </div>
                                        <p className="text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                                            {selectedTool.description}
                                        </p>
                                        <div className="flex items-center gap-3 flex-wrap">
                                            {selectedTool.functional_category && (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                                                    {selectedTool.functional_category.replace(/_/g, ' ')}
                                                </span>
                                            )}
                                            {selectedTool.domain_category && (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                                    {selectedTool.domain_category.replace(/_/g, ' ')}
                                                </span>
                                            )}
                                            {selectedTool.ui_metadata?.difficulty && (
                                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                                    selectedTool.ui_metadata.difficulty === 'beginner' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                                                    selectedTool.ui_metadata.difficulty === 'intermediate' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                                                    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                                }`}>
                                                    {selectedTool.ui_metadata.difficulty}
                                                </span>
                                            )}
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                ID: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">{selectedTool.id}</code>
                                            </span>
                                        </div>
                                        
                                        {/* Tags */}
                                        {selectedTool.tags && selectedTool.tags.length > 0 && (
                                            <div className="mt-3">
                                                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</h5>
                                                <div className="flex flex-wrap gap-1">
                                                    {selectedTool.tags.map(tag => (
                                                        <span key={tag} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Pipeline Information */}
                                        {selectedTool.pipeline_info && (
                                            <div className="mt-3">
                                                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pipeline Information</h5>
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-gray-600 dark:text-gray-400">Pipeline:</span>
                                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                            {selectedTool.pipeline_info.pipeline_name.replace(/_/g, ' ')}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-gray-600 dark:text-gray-400">Can start pipeline:</span>
                                                        <span className={`text-sm font-medium ${
                                                            selectedTool.pipeline_info.can_start_pipeline 
                                                                ? 'text-green-600 dark:text-green-400' 
                                                                : 'text-gray-600 dark:text-gray-400'
                                                        }`}>
                                                            {selectedTool.pipeline_info.can_start_pipeline ? 'Yes' : 'No'}
                                                        </span>
                                                    </div>
                                                    {selectedTool.pipeline_info.typical_next_tools.length > 0 && (
                                                        <div>
                                                            <span className="text-sm text-gray-600 dark:text-gray-400">Typical next tools:</span>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {selectedTool.pipeline_info.typical_next_tools.map(toolId => (
                                                                    <span key={toolId} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                                                        {toolId}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Parameters */}
                                    <div className="mb-6">
                                        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                                            <Info className="w-5 h-5" />
                                            Parameters ({selectedTool.parameters.length})
                                        </h4>
                                        {selectedTool.parameters.length === 0 ? (
                                            <p className="text-gray-500 dark:text-gray-400 text-sm">No parameters required</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {selectedTool.parameters.map(param => (
                                                    <div key={param.name} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                {param.name}
                                                            </span>
                                                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${param.required
                                                                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                                                : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                                                }`}>
                                                                {param.required ? 'Required' : 'Optional'}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                                            {param.description}
                                                        </p>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                            <strong>Type:</strong>
                                                            <div className="mt-1 ml-2">
                                                                {param.schema_definition ? (
                                                                    <SchemaRenderer
                                                                        schema={param.schema_definition}
                                                                        compact={false}
                                                                    />
                                                                ) : (
                                                                    <span className="text-gray-500">unknown</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Outputs */}
                                    <div className="mb-6">
                                        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                                            <CheckCircle className="w-5 h-5" />
                                            Outputs ({selectedTool.outputs.length})
                                        </h4>
                                        {selectedTool.outputs.length === 0 ? (
                                            <p className="text-gray-500 dark:text-gray-400 text-sm">No outputs defined</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {selectedTool.outputs.map(output => (
                                                    <div key={output.name} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                {output.name}
                                                            </span>
                                                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${output.required
                                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                                                }`}>
                                                                {output.required ? 'Always returned' : 'Optional'}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                                            {output.description}
                                                        </p>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                            <strong>Type:</strong>
                                                            <div className="mt-1 ml-2">
                                                                {output.schema_definition ? (
                                                                    <SchemaRenderer
                                                                        schema={output.schema_definition}
                                                                        compact={false}
                                                                    />
                                                                ) : (
                                                                    <span className="text-gray-500">unknown</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Resource Dependencies */}
                                    {selectedTool.resource_dependencies.length > 0 && (
                                        <div className="mb-6">
                                            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                                                <AlertCircle className="w-5 h-5" />
                                                Resource Dependencies ({selectedTool.resource_dependencies.length})
                                            </h4>
                                            <div className="space-y-3">
                                                {selectedTool.resource_dependencies.map(resource => (
                                                    <div key={resource.id} className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                {resource.name}
                                                            </span>
                                                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                                                                {resource.type}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                                            {resource.description}
                                                        </p>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                            <strong>ID:</strong> <code className="bg-orange-100 dark:bg-orange-900/30 px-1 py-0.5 rounded">{resource.id}</code>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Examples */}
                                    {selectedTool.examples && selectedTool.examples.length > 0 && (
                                        <div>
                                            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                                                <Code className="w-5 h-5" />
                                                Examples ({selectedTool.examples.length})
                                            </h4>
                                            <div className="space-y-4">
                                                {selectedTool.examples.map((example, index) => (
                                                    <div key={index} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                                        <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                                                            {example.description}
                                                        </h5>
                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                            <div>
                                                                <h6 className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-1">
                                                                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                                                    Input
                                                                </h6>
                                                                <div className="bg-gray-50 dark:bg-gray-700 rounded p-3 text-xs overflow-x-auto">
                                                                    <VariableRenderer value={example.input} />
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <h6 className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-1">
                                                                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                                                    Output
                                                                </h6>
                                                                <div className="bg-gray-50 dark:bg-gray-700 rounded p-3 text-xs overflow-x-auto">
                                                                    <VariableRenderer value={example.output} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-center">
                                    <div className="max-w-md">
                                        <div className="text-gray-400 dark:text-gray-500 mb-4">
                                            <Code className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                        </div>
                                        <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">
                                            Select a tool to view details
                                        </p>
                                        <p className="text-gray-400 dark:text-gray-500 text-sm">
                                            Click on any tool from the list to see its parameters, outputs, and examples
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};