# LLM Infrastructure Analysis & Repurposing Plan

## Executive Summary

The existing codebase contains a **sophisticated, production-ready LLM infrastructure** that is perfectly suited for the Knowledge Horizon POC. The system includes:

- **Multi-provider support** (OpenAI GPT-5 series, GPT-4.1, Anthropic Claude)
- **Advanced prompt management** with BasePromptCaller
- **Streaming capabilities** for real-time responses
- **Token counting and usage tracking**
- **Dynamic schema-to-Pydantic conversion**
- **Task-specific model routing**
- **Reasoning effort support** for advanced models
- **Connection pooling** for high-performance parallel processing

## Core LLM Components

### 1. BasePromptCaller - The Crown Jewel

**Location**: `backend/agents/prompts/base_prompt_caller.py`

This is the most critical component for LLM interactions. It provides:

```python
class BasePromptCaller:
    def __init__(
        self,
        response_model: Union[Type[BaseModel], Dict[str, Any]],
        system_message: Optional[str] = None,
        messages_placeholder: bool = True,
        model: Optional[str] = None,
        temperature: float = 0.0,
        reasoning_effort: Optional[str] = None
    )
```

**Key Features**:
- **Dynamic Model Creation**: Converts JSON schemas to Pydantic models on the fly
- **Structured Output**: Ensures LLM responses match expected schemas
- **Model Selection**: Easy switching between GPT-5, GPT-5-mini, GPT-4.1
- **Reasoning Effort**: Supports OpenAI's reasoning parameter for complex tasks
- **Connection Pooling**: Shared AsyncOpenAI client with 1000 max connections
- **Usage Tracking**: Returns token usage for cost monitoring

**Example Usage for KH**:
```python
# Onboarding Interview
class UserProfileExtraction(BaseModel):
    full_name: str
    job_title: str
    company: str
    priorities: List[str]

interview_caller = BasePromptCaller(
    response_model=UserProfileExtraction,
    system_message="Extract user information from the conversation",
    model="gpt-5-mini"
)

result = await interview_caller.invoke(messages=chat_history)
```

### 2. LLM Provider Architecture

**Base Class**: `backend/services/llm/base.py`

Abstract base providing unified interface:
- `generate()` - Single response generation
- `generate_stream()` - Streaming responses
- `create_chat_completion()` - Chat-based completions
- `create_chat_completion_stream()` - Streaming chat

**Implementations**:
- `OpenAIProvider` - Full GPT-5/4.1 support
- `AnthropicProvider` - Claude integration

### 3. Model Configuration System

**Location**: `backend/config/llm_models.py`

Sophisticated model capability tracking:

```python
MODEL_CONFIGS = {
    "gpt-5": ModelCapabilities(
        supports_reasoning_effort=True,
        reasoning_effort_levels=["minimal", "low", "medium", "high"],
        max_tokens=128000,
        supports_vision=True
    ),
    "gpt-5-mini": ModelCapabilities(
        supports_reasoning_effort=True,
        reasoning_effort_levels=["minimal", "low", "medium", "high"],
        max_tokens=64000
    )
}
```

**Task-Specific Routing**:
```python
TASK_CONFIGS = {
    "smart_search": {
        "evidence_spec": {"model": "gpt-5-mini", "reasoning_effort": "minimal"},
        "keyword_optimization": {"model": "gpt-5-mini", "reasoning_effort": "medium"},
        "discriminator": {"model": "gpt-4.1", "temperature": 0.0}
    }
}
```

### 4. Streaming Implementation

**Example**: `backend/routers/article_chat.py`

```python
async def chat_about_article_stream():
    # Stream responses in real-time
    async for chunk in provider.create_chat_completion_stream():
        yield f"data: {json.dumps({'content': chunk})}\n\n"
```

## Repurposing Strategy for Knowledge Horizon

### Phase 1: Direct Reuse (No Changes Needed)

These components work perfectly as-is:

1. **BasePromptCaller** - Use for all structured LLM interactions
2. **LLM Providers** - Keep the multi-provider architecture
3. **Model Configuration** - Extend with KH-specific tasks
4. **Streaming Infrastructure** - Use for onboarding chat
5. **Token Counting** - Essential for cost tracking

### Phase 2: KH-Specific Extensions

#### A. Create KH Prompt Callers

```python
# backend/services/kh_prompts/onboarding_caller.py
class OnboardingInterviewCaller(BasePromptCaller):
    def __init__(self):
        super().__init__(
            response_model=OnboardingExtraction,
            system_message="""You are an intelligent onboarding assistant for Knowledge Horizon.
            Extract key information about the user's role and information needs.""",
            model="gpt-5-mini",
            reasoning_effort="low"
        )

# backend/services/kh_prompts/research_caller.py
class CompanyResearchCaller(BasePromptCaller):
    def __init__(self):
        super().__init__(
            response_model=CompanyProfile,
            system_message="""Analyze and synthesize company information from multiple sources.
            Focus on therapeutic areas, pipeline, and competitive landscape.""",
            model="gpt-5",
            reasoning_effort="high"
        )

# backend/services/kh_prompts/mandate_generator.py
class MandateGeneratorCaller(BasePromptCaller):
    def __init__(self):
        super().__init__(
            response_model=CurationMandate,
            system_message="""Generate a comprehensive curation mandate based on user profile.
            Include primary focus areas, competitors, and exclusions.""",
            model="gpt-5",
            reasoning_effort="medium"
        )
```

#### B. Extend Task Configurations

Add to `backend/config/llm_models.py`:

```python
TASK_CONFIGS["knowledge_horizon"] = {
    "onboarding_chat": {
        "model": "gpt-5-mini",
        "reasoning_effort": "low",
        "description": "Interactive onboarding conversation"
    },
    "profile_research": {
        "model": "gpt-5",
        "reasoning_effort": "high",
        "description": "Deep research on company and user"
    },
    "mandate_generation": {
        "model": "gpt-5",
        "reasoning_effort": "medium",
        "description": "Generate curation mandate"
    },
    "article_relevance": {
        "model": "gpt-4.1",
        "temperature": 0.0,
        "description": "Score article relevance"
    },
    "report_synthesis": {
        "model": "gpt-5",
        "reasoning_effort": "high",
        "description": "Synthesize executive summary and insights"
    }
}
```

#### C. Create KH LLM Service

```python
# backend/services/kh_llm_service.py
from agents.prompts.base_prompt_caller import BasePromptCaller

class KHLLMService:
    def __init__(self):
        self.onboarding = OnboardingInterviewCaller()
        self.research = CompanyResearchCaller()
        self.mandate = MandateGeneratorCaller()
        self.relevance = ArticleRelevanceCaller()
        self.synthesis = ReportSynthesisCaller()

    async def conduct_interview(self, messages):
        """AI-driven onboarding interview"""
        return await self.onboarding.invoke(messages)

    async def research_company(self, company_name, user_title):
        """Research company and user context"""
        return await self.research.invoke(
            company=company_name,
            title=user_title
        )

    async def generate_mandate(self, profile):
        """Generate curation mandate from profile"""
        return await self.mandate.invoke(profile=profile)

    async def score_relevance(self, article, mandate):
        """Score article relevance to mandate"""
        return await self.relevance.invoke(
            article=article,
            mandate=mandate
        )

    async def synthesize_report(self, articles, mandate):
        """Generate executive summary and insights"""
        return await self.synthesis.invoke(
            articles=articles,
            mandate=mandate,
            return_usage=True  # Track costs
        )
```

### Phase 3: Optimize for KH Use Cases

#### A. Parallel Processing for Report Generation

```python
async def process_articles_parallel(articles, mandate):
    """Process multiple articles in parallel using shared client"""
    caller = ArticleRelevanceCaller()

    # BasePromptCaller already has connection pooling!
    tasks = [
        caller.invoke(article=article, mandate=mandate)
        for article in articles
    ]

    results = await asyncio.gather(*tasks)
    return results
```

#### B. Streaming for Onboarding Chat

```python
@router.post("/onboarding/chat/stream")
async def onboarding_chat_stream(request: ChatRequest):
    provider = OpenAIProvider()

    async def generate():
        async for chunk in provider.create_chat_completion_stream(
            messages=request.messages,
            model="gpt-5-mini",
            system="You are the Knowledge Horizon onboarding assistant..."
        ):
            yield f"data: {json.dumps({'content': chunk})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

#### C. Cost-Optimized Model Selection

```python
def select_model_for_task(task_type: str, complexity: str):
    """Smart model selection based on task and complexity"""

    model_map = {
        ("onboarding", "simple"): "gpt-5-nano",
        ("onboarding", "complex"): "gpt-5-mini",
        ("research", "simple"): "gpt-5-mini",
        ("research", "complex"): "gpt-5",
        ("relevance", "any"): "gpt-4.1",  # Fast, no reasoning needed
        ("synthesis", "any"): "gpt-5"      # Best quality for reports
    }

    return model_map.get((task_type, complexity), "gpt-5-mini")
```

## Implementation Plan

### Week 1: Foundation
1. ✅ Keep all existing LLM infrastructure
2. Create `backend/services/kh_prompts/` directory
3. Implement KH-specific prompt callers
4. Extend model configurations

### Week 2: Core Services
1. Build KHLLMService with all methods
2. Create response models (Pydantic)
3. Implement streaming endpoints
4. Add usage tracking

### Week 3: Integration
1. Connect to onboarding flow
2. Implement research pipeline
3. Build mandate generation
4. Create relevance scoring

### Week 4: Optimization
1. Implement parallel processing
2. Add caching layer
3. Optimize model selection
4. Cost monitoring dashboard

## Key Advantages of This Architecture

1. **Production Ready**: Battle-tested infrastructure
2. **Type Safety**: Pydantic models ensure structured outputs
3. **Cost Efficient**: Smart model routing, usage tracking
4. **Scalable**: Connection pooling supports 1000+ parallel requests
5. **Flexible**: Easy to add new providers or models
6. **Observable**: Built-in logging and monitoring

## Migration Checklist

- [ ] Keep all files in `backend/agents/prompts/`
- [ ] Keep all files in `backend/services/llm/`
- [ ] Keep `backend/config/llm_models.py`
- [ ] Keep `backend/utils/prompt_logger.py`
- [ ] Create `backend/services/kh_prompts/`
- [ ] Extend TASK_CONFIGS with KH tasks
- [ ] Build KHLLMService
- [ ] Create Pydantic models for KH
- [ ] Implement streaming endpoints
- [ ] Add cost tracking dashboard

## Code Examples for Quick Start

### 1. Onboarding Interview

```python
# backend/api/onboarding.py
from services.kh_llm_service import KHLLMService

llm = KHLLMService()

@router.post("/onboarding/extract")
async def extract_user_info(messages: List[ChatMessage]):
    result = await llm.conduct_interview(messages)
    return {
        "full_name": result.full_name,
        "job_title": result.job_title,
        "company": result.company,
        "priorities": result.priorities
    }
```

### 2. Mandate Generation

```python
@router.post("/mandate/generate")
async def generate_mandate(profile: CompanyProfile):
    llm = KHLLMService()
    mandate = await llm.generate_mandate(profile)
    return mandate
```

### 3. Report Synthesis

```python
@router.post("/reports/synthesize")
async def synthesize_report(report_id: int):
    llm = KHLLMService()

    # Get articles and mandate
    articles = await get_report_articles(report_id)
    mandate = await get_user_mandate(user_id)

    # Generate synthesis with usage tracking
    response = await llm.synthesize_report(
        articles=articles,
        mandate=mandate
    )

    # Save usage for billing
    await save_usage(
        report_id=report_id,
        tokens=response.usage.total_tokens
    )

    return response.result
```

## Conclusion

The existing LLM infrastructure is a **major asset** for the Knowledge Horizon POC. The BasePromptCaller alone will save weeks of development time and provides enterprise-grade features out of the box. By building KH-specific services on top of this foundation, we can focus on the unique aspects of Knowledge Horizon while leveraging battle-tested infrastructure for all LLM interactions.

**Estimated time saved**: 4-6 weeks of LLM infrastructure development
**Risk reduction**: Using proven code reduces bugs and edge cases
**Performance gain**: Connection pooling enables massive parallelization