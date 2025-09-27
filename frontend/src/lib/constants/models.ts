export interface ModelCategories {
    best: string[];
    high_performance: string[];
    fast: string[];
}

export const MODEL_CATEGORIES: ModelCategories = {
    best: ['claude-4-opus-20250514', 'gpt-4'],
    high_performance: ['claude-4-sonnet-20250514', 'gpt-4-turbo-preview', 'gpt-4-vision-preview'],
    fast: ['claude-3-5-haiku-20241022', 'gpt-4-mini']
}; 