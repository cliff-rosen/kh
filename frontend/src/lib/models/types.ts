export interface ModelCategories {
    best: string[];
    high_performance: string[];
    fast: string[];
    legacy: string[];
}

export const MODEL_CATEGORIES: ModelCategories = {
    best: [
        "claude-4-opus-20250514",
        "o4",
        "o3",
        "gpt-4.1"
    ],
    high_performance: [
        "claude-4-sonnet-20250514",
        "o4-mini",
        "gpt-4o",
        "gpt-4o-audio-preview",
        "chatgpt-4o-latest"
    ],
    fast: [
        "o3-mini",
        "claude-3-5-haiku-20241022"
    ],
    legacy: [
        "o1",
        "o1-mini",
        "o1-pro"
    ]
}; 