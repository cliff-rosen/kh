from typing import Dict, Any, List
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from .base_prompt import BasePrompt

class NewsletterSummaryResponse(BaseModel):
    """Structure for newsletter summary response"""
    overview: str = Field(
        description="High-level overview of the key developments and trends"
    )
    trends: Dict[str, List[str]] = Field(
        description="Key trends identified across newsletters",
        default_factory=lambda: {
            "model_advancements": [],
            "deployment_patterns": [],
            "industry_adoption": [],
            "emerging_use_cases": [],
            "technical_insights": []
        }
    )
    significant_developments: List[Dict[str, Any]] = Field(
        description="List of most significant developments with their impact and context"
    )
    company_highlights: Dict[str, List[str]] = Field(
        description="Notable developments by major companies",
        default_factory=lambda: {
            "Microsoft": [],
            "OpenAI": [],
            "Google": [],
            "Anthropic": [],
            "Meta": [],
            "Other": []
        }
    )
    recommendations: List[str] = Field(
        description="Key recommendations or actionable insights for companies building with AI"
    )

class NewsletterSummaryPrompt(BasePrompt):
    """Prompt template for newsletter summarization"""
    
    def __init__(self):
        super().__init__(NewsletterSummaryResponse)
        
        self.system_message = """You are an expert at analyzing and synthesizing information from multiple newsletter articles about generative AI developments. Your task is to identify patterns, trends, and significant developments across multiple newsletters, with special attention to practical implications for companies building and deploying AI applications.


Focus on:

1. Model Advancements and Capabilities:
   - New model capabilities that enable novel applications
   - Performance improvements affecting cost or quality
   - Novel approaches to specific tasks
   - Multimodal capabilities and their practical uses
   - Special attention to developments from major AI companies

2. Deployment Patterns and Infrastructure:
   - New deployment options and architectures
   - Performance optimizations and cost reductions
   - Scaling solutions and infrastructure improvements
   - Runtime improvements affecting production deployments
   - Integration patterns and best practices

3. Industry Adoption and Use Cases:
   - Successful enterprise deployments
   - Industry-specific solutions
   - Novel applications solving real problems
   - Case studies with measurable impact
   - Integration patterns with existing systems

4. Technical Insights and Best Practices:
   - Production deployment patterns
   - Cost optimization strategies
   - Performance tuning techniques
   - Security and compliance approaches
   - Scaling and reliability best practices

5. Company-Specific Developments:
   - Major announcements from key players
   - Strategic shifts and partnerships
   - Product launches and updates
   - Research breakthroughs
   - Market positioning changes

6. Recommendations and Actionable Insights:
   - Specific recommendations for companies building with AI
   - Strategic considerations based on the developments
   - Practical next steps for implementation
   - Risk mitigation strategies
   - Competitive positioning advice

Filter out:
- Minor updates or incremental improvements
- Small application releases without novel approaches
- Routine product updates without significant new capabilities
- Speculative or unsubstantiated claims
- Marketing fluff without concrete developments
- Non-generative AI developments without practical applications
- Academic research without clear practical implications

For each category, provide specific, factual information found across the newsletters. If no significant developments are found for a category, include "none found"."""

        self.user_message_template = """Please analyze and summarize the following newsletter extractions from {count} newsletters, focusing on identifying patterns, trends, and significant developments that impact companies building and deploying AI applications.

Newsletter Extractions:
{extractions}

{format_instructions}"""

    def get_prompt_template(self) -> ChatPromptTemplate:
        """Return a ChatPromptTemplate for newsletter summarization"""
        return ChatPromptTemplate.from_messages([
            ("system", self.system_message),
            ("human", self.user_message_template)
        ]) 