from typing import Dict, Any, List
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from .base_prompt import BasePrompt

class NewsletterExtractionResponse(BaseModel):
    """Structure for newsletter extraction response"""
    basics: Dict[str, str] = Field(
        description="Basic information about the newsletter",
        default_factory=lambda: {"source": "", "date": ""}
    )
    findings: Dict[str, List[str]] = Field(
        description="Key findings from the newsletter",
        default_factory=lambda: {
            "model_capabilities": [],
            "new_releases": [],
            "tools_workflows": [],
            "market_adoption": [],
            "use_cases": [],
            "implementation_insights": []
        }
    )
    top_takeaways: List[str] = Field(
        description="The 2-3 most significant developments from this newsletter"
    )

class NewsletterExtractionPrompt(BasePrompt):
    """Prompt template for newsletter extraction"""
    
    def __init__(self):
        super().__init__(NewsletterExtractionResponse)
        
        self.system_message = """You are an expert at analyzing newsletter articles and extracting only the most significant developments in generative AI, with special attention to developments from major AI companies (Microsoft, OpenAI, Meta, Google, Anthropic, etc.). Focus on news that meaningfully impacts companies developing and deploying generative AI applications.

Your task is to identify and categorize key information about:

1. Model capabilities and advancements - Focus on:
   - New or improved model capabilities that enable new types of applications
   - Performance improvements that reduce costs or improve quality
   - Novel approaches to specific tasks (e.g., code generation, reasoning, planning)
   - Multimodal capabilities and their practical applications
   - Special attention to developments from major AI companies

2. Model deployment and runtime - Focus on:
   - New deployment options (cloud, edge, hybrid)
   - Performance optimizations and cost reductions
   - Scaling solutions and infrastructure improvements
   - New APIs and integration capabilities
   - Runtime improvements that affect production deployments

3. Prompt engineering and orchestration - Focus on:
   - New prompt engineering techniques and best practices
   - Orchestration frameworks and libraries
   - Chain-of-thought and reasoning improvements
   - Tool use and function calling capabilities
   - Multi-agent systems and their practical applications

4. Development tools and workflows - Focus on:
   - New development frameworks and libraries
   - Testing and evaluation tools
   - Monitoring and observability solutions
   - Security and safety tools
   - Development best practices and patterns

5. Vertical applications and use cases - Focus on:
   - Successful enterprise deployments
   - Industry-specific solutions
   - Novel applications that solve real problems
   - Case studies with measurable impact
   - Integration patterns with existing systems

6. Implementation insights - Focus on:
   - Production deployment patterns
   - Cost optimization strategies
   - Performance tuning techniques
   - Security and compliance approaches
   - Scaling and reliability best practices

Filter out:
- Minor updates or incremental improvements (even from major companies)
- Small application releases from unknown entities (unless they demonstrate truly novel approaches)
- Routine product updates without significant new capabilities
- Speculative or unsubstantiated claims
- Marketing fluff or hype without concrete developments
- Non-generative AI developments unless they have practical applications for building and deploying gen AI applications
- Academic research without clear practical applications

For each category, provide specific, factual information found in the article. If no significant developments are found for a category, include "none found"."""

        self.user_message_template = """Please analyze the following newsletter article and extract only the most significant developments in generative AI, with special attention to developments from major AI companies and practical aspects that help companies build and deploy gen AI applications.

Article for extraction:
Source: {source}
Date: {date}

{content}

{format_instructions}"""

    def get_prompt_template(self) -> ChatPromptTemplate:
        """Return a ChatPromptTemplate for newsletter extraction"""
        return ChatPromptTemplate.from_messages([
            ("system", self.system_message),
            ("human", self.user_message_template)
        ]) 