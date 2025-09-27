import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle, X } from 'lucide-react';

interface Subsection {
    id: string;
    title: string;
    content: React.ReactNode;
}

interface Section {
    id: string;
    title: string;
    content?: React.ReactNode;
    subsections?: Subsection[];
}

const sections: Section[] = [
    {
        id: 'overview',
        title: 'Overview',
        content: (
            <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">What is HopBot?</h4>
                    <p className="text-gray-700 dark:text-gray-300 mb-3">
                        HopBot is a precision workflow orchestration system that breaks down complex tasks into verifiable, controllable 'hops'. Unlike traditional automation tools, it:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Decomposes Complex Tasks:</strong> Breaks down any complex problem into a series of clear, objective-driven stages called "hops"</li>
                        <li><strong>Provides Human Oversight:</strong> Gives you visibility and control at every step, with the ability to inspect, modify, and confirm intermediate outputs</li>
                        <li><strong>Ensures Quality:</strong> Each hop produces verifiable intermediate results that you can validate before proceeding</li>
                        <li><strong>Maintains Traceability:</strong> Every stage, from raw input to final output, is visible and auditable</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">How is it Different?</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h5 className="font-medium text-gray-900 dark:text-white mb-2">Compared to Traditional Workflow Tools:</h5>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                                <li>No manual workflow building - hops are designed dynamically</li>
                                <li>Provides intermediate outputs you can inspect and modify</li>
                                <li>Natural language interaction for task definition</li>
                                <li>Built-in verification at each stage</li>
                            </ul>
                        </div>
                        <div>
                            <h5 className="font-medium text-gray-900 dark:text-white mb-2">Compared to Black-Box AI:</h5>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                                <li>Complete transparency into decision-making process</li>
                                <li>Human oversight and control at every step</li>
                                <li>Verifiable intermediate results</li>
                                <li>Ability to refine and adjust as needed</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Key Benefits</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Transparent:</strong> Every stage, from raw input to final output, is visible and auditable</li>
                        <li><strong>Controlled:</strong> Define objectives, inspect results, and refine each hop to match your intent</li>
                        <li><strong>Tractable:</strong> Complex workflows broken into manageable, verifiable, and debuggable segments</li>
                        <li><strong>Versatile:</strong> Adaptable across diverse domains, from data analysis to content generation</li>
                        <li><strong>Accelerated:</strong> Achieve high-quality, precise results faster with guided, intelligent automation</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        id: 'core-concepts',
        title: 'Core Concepts',
        subsections: [
            {
                id: 'workflow-basics',
                title: '1. Workflow Basics',
                content: (
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                        <p className="text-gray-700 dark:text-gray-300 mb-3">
                            HopBot follows a systematic approach to workflow orchestration:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                            <li><strong>Mission Definition:</strong> Start by clearly specifying what you want to achieve
                                <ul className="list-disc pl-6 mt-2">
                                    <li>What is your overall goal?</li>
                                    <li>What are the final deliverables?</li>
                                    <li>How will you know you've succeeded?</li>
                                </ul>
                            </li>
                            <li><strong>Hop Design:</strong> Break down the mission into discrete, manageable stages
                                <ul className="list-disc pl-6 mt-2">
                                    <li>Each hop has a specific objective</li>
                                    <li>Hops produce intermediate outputs you can verify</li>
                                    <li>Hops can be refined based on results</li>
                                </ul>
                            </li>
                            <li><strong>Execution & Verification:</strong> Execute each hop with human oversight
                                <ul className="list-disc pl-6 mt-2">
                                    <li>Review intermediate outputs</li>
                                    <li>Provide feedback and adjustments</li>
                                    <li>Verify quality before proceeding</li>
                                </ul>
                            </li>
                        </ul>
                        <p className="text-gray-700 dark:text-gray-300 mt-4">
                            This approach scales from simple tasks to complex missions:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                            <li><strong>Simple Tasks:</strong> A single hop with one or two tools</li>
                            <li><strong>Complex Tasks:</strong> Multiple hops with different objectives</li>
                            <li><strong>Missions:</strong> Multi-hop workflows with clear progression toward the goal</li>
                        </ul>
                    </div>
                )
            },
            {
                id: 'schema',
                title: '2. Schema',
                content: (
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                        <p className="text-gray-700 dark:text-gray-300 mb-3">
                            HopBot uses a structured schema to organize and track workflow execution:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                            <li><strong>Mission:</strong> The top-level container that defines the overall goal
                                <ul className="list-disc pl-6 mt-2">
                                    <li><strong>Goal:</strong> The fundamental reason for the mission - what you ultimately want to achieve</li>
                                    <li><strong>Success Criteria:</strong> The measurable conditions that verify the outputs actually achieve the goal</li>
                                    <li><strong>Inputs:</strong> Required data objects to start the mission</li>
                                    <li><strong>Outputs:</strong> The specific deliverables that will achieve the goal</li>
                                    <li><strong>Current Hop:</strong> The hop currently being designed or executed</li>
                                    <li><strong>Hop History:</strong> Record of completed hops</li>
                                </ul>
                            </li>
                            <li><strong>Hop:</strong> A discrete stage in the mission with specific objectives
                                <ul className="list-disc pl-6 mt-2">
                                    <li><strong>Name & Description:</strong> Clear definition of what the hop accomplishes</li>
                                    <li><strong>Input Mapping:</strong> Maps local hop state keys to mission asset IDs</li>
                                    <li><strong>Output Mapping:</strong> Maps local hop state keys to mission asset IDs</li>
                                    <li><strong>Tool Steps:</strong> Individual operations within the hop</li>
                                    <li><strong>Hop State:</strong> Data objects used within the hop</li>
                                    <li><strong>Status:</strong> Current state (plan proposed, implementation ready, executing, completed)</li>
                                </ul>
                            </li>
                            <li><strong>Tool Step:</strong> An individual operation within a hop
                                <ul className="list-disc pl-6 mt-2">
                                    <li><strong>Tool ID:</strong> The specific tool to execute</li>
                                    <li><strong>Description:</strong> What this step accomplishes</li>
                                    <li><strong>Parameter Mapping:</strong> How tool inputs map to hop state</li>
                                    <li><strong>Result Mapping:</strong> How tool outputs map to hop state</li>
                                    <li><strong>Status:</strong> Execution status (pending, running, completed, failed)</li>
                                </ul>
                            </li>
                            <li><strong>Asset:</strong> A piece of information that flows through the workflow
                                <ul className="list-disc pl-6 mt-2">
                                    <li><strong>Name & Description:</strong> Clear identification of the asset</li>
                                    <li><strong>Schema Definition:</strong> Structure and type of the asset</li>
                                    <li><strong>Value:</strong> The actual data content</li>
                                    <li><strong>Status:</strong> Current state (pending, ready, archived)</li>
                                    <li><strong>Role:</strong> Purpose in the workflow (input, output, intermediate)</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                )
            },
            {
                id: 'realtime-evolution',
                title: '3. Real-time Workflow Evolution',
                content: (
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                        <p className="text-gray-700 dark:text-gray-300 mb-3">
                            HopBot workflows evolve in real-time through several key phases:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                            <li><strong>Mission Proposal:</strong> Initial definition and planning
                                <ul className="list-disc pl-6 mt-2">
                                    <li>Defines the goal and success criteria</li>
                                    <li>Identifies required inputs and expected outputs</li>
                                    <li>Evaluates mission feasibility</li>
                                    <li>Establishes the foundation for quality throughout</li>
                                </ul>
                            </li>
                            <li><strong>Hop Design:</strong> Creating the next hop in the mission
                                <ul className="list-disc pl-6 mt-2">
                                    <li>Analyzes available mission state</li>
                                    <li>Designs hop objectives and structure</li>
                                    <li>Maps inputs and outputs</li>
                                    <li>Proposes hop for user approval</li>
                                </ul>
                            </li>
                            <li><strong>Hop Implementation:</strong> Resolving the hop with specific tools
                                <ul className="list-disc pl-6 mt-2">
                                    <li>Analyzes hop requirements</li>
                                    <li>Selects appropriate tools</li>
                                    <li>Creates tool steps with parameter mappings</li>
                                    <li>Validates the implementation plan</li>
                                </ul>
                            </li>
                            <li><strong>Hop Execution:</strong> Running the hop with human oversight
                                <ul className="list-disc pl-6 mt-2">
                                    <li>Executes tool steps sequentially</li>
                                    <li>Updates hop state with results</li>
                                    <li>Provides intermediate outputs for review</li>
                                    <li>Handles errors and retries</li>
                                </ul>
                            </li>
                            <li><strong>Mission Completion:</strong> Final verification and delivery
                                <ul className="list-disc pl-6 mt-2">
                                    <li>Verifies all success criteria are met</li>
                                    <li>Delivers final outputs</li>
                                    <li>Archives completed assets</li>
                                    <li>Provides mission summary</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                )
            }
        ]
    },
    {
        id: 'interface',
        title: 'Interface Guide',
        content: (
            <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Chat Interface</h4>
                    <p className="text-gray-700 dark:text-gray-300 mb-3">
                        Your main interaction point with HopBot:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li>Describe tasks in natural language</li>
                        <li>Review mission proposals</li>
                        <li>Approve or modify hop designs</li>
                        <li>Monitor execution progress</li>
                        <li>Provide feedback and guidance</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Collaboration Area</h4>
                    <p className="text-gray-700 dark:text-gray-300 mb-3">
                        The central area for mission management and hop interaction:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li>View current mission details and progress</li>
                        <li>Review and approve hop proposals</li>
                        <li>Inspect hop implementations</li>
                        <li>Monitor tool step execution</li>
                        <li>Control hop execution (start, stop, retry)</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Asset Panels</h4>
                    <p className="text-gray-700 dark:text-gray-300 mb-3">
                        Manage your mission data and resources:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li>View mission state and hop state</li>
                        <li>Inspect asset values and status</li>
                        <li>Track data flow through the workflow</li>
                        <li>Monitor resource usage and availability</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Tool Browser</h4>
                    <p className="text-gray-700 dark:text-gray-300 mb-3">
                        Explore available tools and capabilities:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li>Browse available tools by category</li>
                        <li>View tool descriptions and parameters</li>
                        <li>Understand tool capabilities and limitations</li>
                        <li>See examples of tool usage</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        id: 'smartsearch2',
        title: 'SmartSearch2',
        subsections: [
            {
                id: 'overview',
                title: '1. Overview',
                content: (
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                        <p className="text-gray-700 dark:text-gray-300 mb-4">
                            SmartSearch2 is a comprehensive research workflow system that combines AI-powered search assistance with
                            multiple data sources to help you find, filter, and analyze research literature efficiently.
                        </p>
                        <div className="space-y-4">
                            <div>
                                <h5 className="font-medium text-gray-900 dark:text-white mb-2">Key Features:</h5>
                                <ul className="list-disc pl-6 space-y-1 text-gray-700 dark:text-gray-300">
                                    <li><strong>Multi-source Search:</strong> Search across PubMed, Google Scholar, and other academic databases</li>
                                    <li><strong>AI-Powered Filtering:</strong> Use natural language to filter results by relevance and criteria</li>
                                    <li><strong>Smart Keyword Assistant:</strong> Get AI help to develop comprehensive search strategies</li>
                                    <li><strong>Column Extraction:</strong> Extract specific data points from research articles using AI</li>
                                    <li><strong>Google Scholar Enrichment:</strong> Enhance your search results with additional academic sources</li>
                                </ul>
                            </div>
                            <div>
                                <h5 className="font-medium text-gray-900 dark:text-white mb-2">Perfect For:</h5>
                                <ul className="list-disc pl-6 space-y-1 text-gray-700 dark:text-gray-300">
                                    <li>Systematic literature reviews</li>
                                    <li>Research discovery and exploration</li>
                                    <li>Evidence synthesis and meta-analysis preparation</li>
                                    <li>Academic research and writing support</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: 'basic-workflow',
                title: '2. Basic Research Workflow',
                content: (
                    <div className="space-y-6">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                            <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">🔍 Step 1: Start Your Search</h5>
                            <p className="text-blue-800 dark:text-blue-200 mb-3">
                                Begin by entering your research keywords and selecting your preferred data source (PubMed, Google Scholar, etc.).
                            </p>
                            <ul className="list-disc pl-6 space-y-1 text-blue-700 dark:text-blue-300">
                                <li>Enter keywords that describe your research topic</li>
                                <li>Choose your data source based on your field (PubMed for medical, Google Scholar for broader academic)</li>
                                <li>Set pagination to control how many results to retrieve initially</li>
                                <li>Use Boolean operators (AND, OR, NOT) for more precise searches</li>
                            </ul>
                        </div>

                        <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg border border-green-200 dark:border-green-800">
                            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-3">🎯 Step 2: Apply AI Filtering</h5>
                            <p className="text-green-800 dark:text-green-200 mb-3">
                                Use natural language to describe what you're looking for, and let AI filter your results for relevance.
                            </p>
                            <ul className="list-disc pl-6 space-y-1 text-green-700 dark:text-green-300">
                                <li>Describe your research criteria in plain English</li>
                                <li>Examples: "Studies with randomized controlled trials", "Papers about machine learning in healthcare"</li>
                                <li>Choose strictness level: Low (inclusive), Medium (balanced), High (strict)</li>
                                <li>Review filtered results and confidence scores</li>
                            </ul>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                            <h5 className="font-semibold text-gray-900 dark:text-white mb-3">🔄 Typical Workflow Pattern</h5>
                            <div className="space-y-3">
                                <div className="flex items-center space-x-3">
                                    <span className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center justify-center text-sm font-medium">1</span>
                                    <span className="text-gray-700 dark:text-gray-300">Search with initial keywords → Get broad results</span>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <span className="flex-shrink-0 w-8 h-8 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full flex items-center justify-center text-sm font-medium">2</span>
                                    <span className="text-gray-700 dark:text-gray-300">Apply AI filter → Narrow to relevant papers</span>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <span className="flex-shrink-0 w-8 h-8 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full flex items-center justify-center text-sm font-medium">3</span>
                                    <span className="text-gray-700 dark:text-gray-300">Use optional features as needed (AI keywords, Google enrichment, column extraction)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: 'ai-keyword-helper',
                title: '3. AI Keyword Helper',
                content: (
                    <div className="space-y-6">
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                            <p className="text-gray-700 dark:text-gray-300 mb-4">
                                The AI Keyword Helper guides you through developing comprehensive search strategies by breaking down your research question into systematic components.
                            </p>
                        </div>

                        <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-lg border border-purple-200 dark:border-purple-800">
                            <h5 className="font-semibold text-purple-900 dark:text-purple-100 mb-3">📋 Step 1: Evidence Specification</h5>
                            <p className="text-purple-800 dark:text-purple-200 mb-3">
                                Describe what you're looking for in natural language. The AI helps you refine this into a clear, comprehensive evidence specification.
                            </p>
                            <ul className="list-disc pl-6 space-y-1 text-purple-700 dark:text-purple-300">
                                <li>Example: "I want studies about the effectiveness of meditation on anxiety in college students"</li>
                                <li>AI will ask clarifying questions to complete your specification</li>
                                <li>Helps identify population, intervention, comparison, and outcomes (PICO framework)</li>
                            </ul>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-lg border border-amber-200 dark:border-amber-800">
                            <h5 className="font-semibold text-amber-900 dark:text-amber-100 mb-3">🔑 Step 2: Concept Extraction</h5>
                            <p className="text-amber-800 dark:text-amber-200 mb-3">
                                AI extracts key searchable concepts from your evidence specification.
                            </p>
                            <ul className="list-disc pl-6 space-y-1 text-amber-700 dark:text-amber-300">
                                <li>Automatically identifies main concepts and themes</li>
                                <li>Examples: "meditation", "anxiety", "college students", "effectiveness"</li>
                                <li>Forms the foundation for your search strategy</li>
                            </ul>
                        </div>

                        <div className="bg-cyan-50 dark:bg-cyan-900/20 p-6 rounded-lg border border-cyan-200 dark:border-cyan-800">
                            <h5 className="font-semibold text-cyan-900 dark:text-cyan-100 mb-3">🌐 Step 3: Concept Expansion</h5>
                            <p className="text-cyan-800 dark:text-cyan-200 mb-3">
                                Each concept is expanded into comprehensive search expressions with synonyms, related terms, and variations.
                            </p>
                            <ul className="list-disc pl-6 space-y-1 text-cyan-700 dark:text-cyan-300">
                                <li>"meditation" → "meditation OR mindfulness OR contemplative practice"</li>
                                <li>"anxiety" → "anxiety OR stress OR worry OR psychological distress"</li>
                                <li>Includes both MeSH terms and free text variations</li>
                            </ul>
                        </div>

                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-lg border border-indigo-200 dark:border-indigo-800">
                            <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-3">🧪 Step 4: Coverage Testing</h5>
                            <p className="text-indigo-800 dark:text-indigo-200 mb-3">
                                Test your search strategy by combining concepts and checking estimated results.
                            </p>
                            <ul className="list-disc pl-6 space-y-1 text-indigo-700 dark:text-indigo-300">
                                <li>Combines all concept expressions with AND logic</li>
                                <li>Shows estimated number of results for your database</li>
                                <li>Helps you balance comprehensiveness with manageability</li>
                                <li>Can refine concepts if results are too broad or narrow</li>
                            </ul>
                        </div>
                    </div>
                )
            },
            {
                id: 'google-enrichment',
                title: '4. Google Scholar Enrichment',
                content: (
                    <div className="space-y-6">
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                            <p className="text-gray-700 dark:text-gray-300 mb-4">
                                Google Scholar Enrichment expands your research by finding additional relevant papers that might not appear in your initial database search.
                            </p>
                        </div>

                        <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg border border-orange-200 dark:border-orange-800">
                            <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-3">📚 When to Use Google Enrichment</h5>
                            <ul className="list-disc pl-6 space-y-2 text-orange-700 dark:text-orange-300">
                                <li><strong>After Initial Search:</strong> Use it to supplement results from PubMed or other databases</li>
                                <li><strong>Interdisciplinary Research:</strong> Google Scholar covers broader academic sources beyond medical literature</li>
                                <li><strong>Gray Literature:</strong> Find reports, theses, and conference papers not in traditional databases</li>
                                <li><strong>Citation Discovery:</strong> Identify highly-cited papers you might have missed</li>
                            </ul>
                        </div>

                        <div className="bg-teal-50 dark:bg-teal-900/20 p-6 rounded-lg border border-teal-200 dark:border-teal-800">
                            <h5 className="font-semibold text-teal-900 dark:text-teal-100 mb-3">⚙️ How It Works</h5>
                            <div className="space-y-3">
                                <div className="flex items-start space-x-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 rounded-full flex items-center justify-center text-xs font-medium">1</span>
                                    <div>
                                        <strong className="text-teal-800 dark:text-teal-200">Search Google Scholar:</strong>
                                        <p className="text-teal-700 dark:text-teal-300 text-sm">Uses your keywords to search Google Scholar's vast academic database</p>
                                    </div>
                                </div>
                                <div className="flex items-start space-x-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 rounded-full flex items-center justify-center text-xs font-medium">2</span>
                                    <div>
                                        <strong className="text-teal-800 dark:text-teal-200">Real-time Streaming:</strong>
                                        <p className="text-teal-700 dark:text-teal-300 text-sm">Results stream in real-time so you can see progress</p>
                                    </div>
                                </div>
                                <div className="flex items-start space-x-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 rounded-full flex items-center justify-center text-xs font-medium">3</span>
                                    <div>
                                        <strong className="text-teal-800 dark:text-teal-200">Optional Enhancement:</strong>
                                        <p className="text-teal-700 dark:text-teal-300 text-sm">Can enrich abstracts and summaries for better analysis</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                            <h5 className="font-semibold text-gray-900 dark:text-white mb-3">💡 Best Practices</h5>
                            <ul className="list-disc pl-6 space-y-1 text-gray-700 dark:text-gray-300">
                                <li>Use after you've filtered your initial results to avoid overwhelming data</li>
                                <li>Set year filters to focus on recent or historical research as needed</li>
                                <li>Enable summary enrichment if you need better abstracts for analysis</li>
                                <li>Consider Google Scholar results alongside, not instead of, database searches</li>
                            </ul>
                        </div>
                    </div>
                )
            },
            {
                id: 'column-extraction',
                title: '5. AI Column Extraction',
                content: (
                    <div className="space-y-6">
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                            <p className="text-gray-700 dark:text-gray-300 mb-4">
                                AI Column Extraction automatically extracts specific data points from your research articles, creating structured datasets for analysis.
                            </p>
                        </div>

                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-lg border border-emerald-200 dark:border-emerald-800">
                            <h5 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-3">📊 What You Can Extract</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <strong className="text-emerald-800 dark:text-emerald-200 block mb-2">Study Characteristics:</strong>
                                    <ul className="list-disc pl-6 space-y-1 text-emerald-700 dark:text-emerald-300 text-sm">
                                        <li>Sample size</li>
                                        <li>Study design</li>
                                        <li>Population demographics</li>
                                        <li>Duration of study</li>
                                        <li>Geographic location</li>
                                    </ul>
                                </div>
                                <div>
                                    <strong className="text-emerald-800 dark:text-emerald-200 block mb-2">Results & Outcomes:</strong>
                                    <ul className="list-disc pl-6 space-y-1 text-emerald-700 dark:text-emerald-300 text-sm">
                                        <li>Primary outcomes</li>
                                        <li>Effect sizes</li>
                                        <li>P-values and confidence intervals</li>
                                        <li>Side effects or adverse events</li>
                                        <li>Key findings</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="bg-rose-50 dark:bg-rose-900/20 p-6 rounded-lg border border-rose-200 dark:border-rose-800">
                            <h5 className="font-semibold text-rose-900 dark:text-rose-100 mb-3">🎯 How to Define Features</h5>
                            <div className="space-y-3">
                                <p className="text-rose-800 dark:text-rose-200">For each feature you want to extract, provide:</p>
                                <ul className="list-disc pl-6 space-y-2 text-rose-700 dark:text-rose-300">
                                    <li>
                                        <strong>Feature Name:</strong> A clear, concise name for your data point
                                        <span className="block text-sm italic mt-1">Example: "Sample_Size"</span>
                                    </li>
                                    <li>
                                        <strong>Description:</strong> Detailed description of what to extract and how
                                        <span className="block text-sm italic mt-1">Example: "Total number of participants in the study. If multiple groups, report the total across all groups."</span>
                                    </li>
                                    <li>
                                        <strong>Be Specific:</strong> Include format preferences, units, and edge cases
                                        <span className="block text-sm italic mt-1">Example: "Report as number only. If range given, use the midpoint."</span>
                                    </li>
                                </ul>
                            </div>
                        </div>

                        <div className="bg-violet-50 dark:bg-violet-900/20 p-6 rounded-lg border border-violet-200 dark:border-violet-800">
                            <h5 className="font-semibold text-violet-900 dark:text-violet-100 mb-3">📈 Working with Results</h5>
                            <ul className="list-disc pl-6 space-y-2 text-violet-700 dark:text-violet-300">
                                <li><strong>Structured Output:</strong> Results appear as a table with your articles as rows and features as columns</li>
                                <li><strong>Download Options:</strong> Export to CSV or Excel for further analysis</li>
                                <li><strong>Quality Indicators:</strong> AI provides confidence scores for each extraction</li>
                                <li><strong>Missing Data:</strong> Clearly indicates when information isn't available in the source</li>
                                <li><strong>Review & Validate:</strong> Always review AI extractions for accuracy before using in analysis</li>
                            </ul>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                            <h5 className="font-semibold text-gray-900 dark:text-white mb-3">🔄 Typical Use Cases</h5>
                            <div className="space-y-3">
                                <div>
                                    <strong className="text-gray-800 dark:text-gray-200">Systematic Reviews:</strong>
                                    <p className="text-gray-700 dark:text-gray-300 text-sm">Extract standardized data for evidence tables and meta-analysis</p>
                                </div>
                                <div>
                                    <strong className="text-gray-800 dark:text-gray-200">Literature Analysis:</strong>
                                    <p className="text-gray-700 dark:text-gray-300 text-sm">Compare methodologies, populations, and outcomes across studies</p>
                                </div>
                                <div>
                                    <strong className="text-gray-800 dark:text-gray-200">Research Planning:</strong>
                                    <p className="text-gray-700 dark:text-gray-300 text-sm">Identify gaps in existing research and inform study design</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        ]
    },
    {
        id: 'best-practices',
        title: 'Best Practices',
        content: (
            <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Mission Design</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Start with Clear Goals:</strong> Define specific, measurable objectives that truly represent what you want to achieve</li>
                        <li><strong>Set Concrete Success Criteria:</strong> Ensure your success criteria are verifiable and directly related to goal achievement</li>
                        <li><strong>Identify All Required Inputs:</strong> Be comprehensive about what data and resources you need to start</li>
                        <li><strong>Scope Appropriately:</strong> Break down complex missions into smaller, manageable pieces</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Hop Design</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Focus on Single Objectives:</strong> Each hop should have one clear, specific purpose</li>
                        <li><strong>Plan for Verification:</strong> Design hops to produce outputs you can inspect and validate</li>
                        <li><strong>Consider Dependencies:</strong> Ensure each hop has the inputs it needs from previous hops</li>
                        <li><strong>Allow for Iteration:</strong> Be prepared to refine hops based on intermediate results</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Execution & Oversight</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Review Intermediate Outputs:</strong> Take time to inspect and validate results at each hop</li>
                        <li><strong>Provide Timely Feedback:</strong> Respond quickly to requests for clarification or approval</li>
                        <li><strong>Monitor for Issues:</strong> Watch for errors or unexpected results that might need attention</li>
                        <li><strong>Be Prepared to Adjust:</strong> Don't hesitate to modify hops or add clarification when needed</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Quality Assurance</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Verify at Each Stage:</strong> Don't assume quality - check intermediate outputs</li>
                        <li><strong>Use Success Criteria:</strong> Reference your defined criteria to ensure you're on track</li>
                        <li><strong>Document Issues:</strong> Note any problems or unexpected results for future reference</li>
                        <li><strong>Iterate When Needed:</strong> Be willing to go back and refine earlier hops if necessary</li>
                    </ul>
                </div>
            </div>
        )
    }
];

export const HelpGuide: React.FC = () => {
    const [activeSection, setActiveSection] = useState<string>('overview');
    const [activeSubsection, setActiveSubsection] = useState<string | null>(null);

    const renderNavigation = () => {
        return (
            <nav className="p-4 space-y-1">
                {sections.map(section => (
                    <div key={section.id}>
                        <button
                            onClick={() => {
                                setActiveSection(section.id);
                                setActiveSubsection(null);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors
                                      ${activeSection === section.id && !activeSubsection
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700/50'
                                }`}
                        >
                            {section.title}
                        </button>
                        {(section.id === 'core-concepts' || section.id === 'smartsearch2') && section.subsections && (
                            <div className="pl-4 mt-1 space-y-1">
                                {section.subsections.map(subsection => (
                                    <button
                                        key={subsection.id}
                                        onClick={() => {
                                            setActiveSection(section.id);
                                            setActiveSubsection(subsection.id);
                                        }}
                                        className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors
                                                  ${activeSubsection === subsection.id
                                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700/50'
                                            }`}
                                    >
                                        {subsection.title}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </nav>
        );
    };

    const renderContent = () => {
        const section = sections.find(s => s.id === activeSection);
        if (!section) return null;

        if ((section.id === 'core-concepts' || section.id === 'smartsearch2') && activeSubsection) {
            const subsection = section.subsections?.find(s => s.id === activeSubsection);
            return subsection?.content;
        }

        return section.content;
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="inline-flex items-center justify-center rounded-md w-8 h-8
                             text-gray-400 hover:text-gray-500 hover:bg-gray-100
                             dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
                             transition-colors"
                    aria-label="Help"
                >
                    <HelpCircle className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl h-[80vh] flex flex-col">
                <DialogClose asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-4 top-4
                                 inline-flex items-center justify-center rounded-md w-8 h-8
                                 text-gray-400 hover:text-gray-500 hover:bg-gray-100
                                 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800
                                 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
                                 transition-colors"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </DialogClose>
                <DialogHeader className="border-b border-gray-200 dark:border-gray-700 pb-4">
                    <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-white">HopBot Help Guide</DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left Navigation */}
                    <div className="w-48 border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-800/50">
                        {renderNavigation()}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
                        <div className="max-w-4xl mx-auto p-8">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                                {activeSubsection
                                    ? sections.find(s => s.id === activeSection)?.subsections?.find(s => s.id === activeSubsection)?.title
                                    : sections.find(s => s.id === activeSection)?.title}
                            </h2>
                            <div className="prose dark:prose-invert max-w-none">
                                {renderContent()}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}; 