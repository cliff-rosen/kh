┌─────────────────────────────────────────────────────────────────────────┐
│                         RESEARCH STREAM                                 │
│                                                                         │
│  Purpose: "Monitor diabetes market intelligence for strategic          │
│            decision-making"                                             │
│                                                                         │
│  Stream Type: MIXED                                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌─────────────────────────┐    ┌─────────────────────────┐
        │ CHANNEL 1               │    │ CHANNEL 2               │
        │ "GLP-1 Competitors"     │    │ "FDA Approvals"         │
        │ Type: COMPETITIVE       │    │ Type: REGULATORY        │
        │                         │    │                         │
        │ Keywords:               │    │ Keywords:               │
        │ • semaglutide           │    │ • diabetes              │
        │ • tirzepatide           │    │ • FDA approval          │
        │ • Novo Nordisk          │    │ • NDA                   │
        │ • Eli Lilly             │    │                         │
        │                         │    │                         │
        │ Focus: "Monitor         │    │ Focus: "Track           │
        │ competitive product     │    │ regulatory approvals"   │
        │ launches"               │    │                         │
        └─────────────────────────┘    └─────────────────────────┘
                    │                               │
        ┌───────────┼───────────┐      ┌───────────┼───────────┐
        │           │           │      │           │           │
        ▼           ▼           ▼      ▼           ▼           ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │ SOURCE │ │ SOURCE │ │ SOURCE │ │ SOURCE │ │ SOURCE │ │ SOURCE │
    │ PubMed │ │Scholar │ │Clinical│ │ PubMed │ │  FDA   │ │Regula- │
    │        │ │        │ │Trials  │ │        │ │  RSS   │ │tory DB │
    └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
        │           │           │          │           │           │
        ▼           ▼           ▼          ▼           ▼           ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │ QUERY  │ │ QUERY  │ │ QUERY  │ │ QUERY  │ │ QUERY  │ │ QUERY  │
    │CONSTRUC│ │CONSTRUC│ │CONSTRUC│ │CONSTRUC│ │CONSTRUC│ │CONSTRUC│
    │  TION  │ │  TION  │ │  TION  │ │  TION  │ │  TION  │ │  TION  │
    │        │ │        │ │        │ │        │ │        │ │        │
    │PubMed  │ │Scholar │ │Trials  │ │PubMed  │ │  RSS   │ │  API   │
    │ syntax │ │ syntax │ │ syntax │ │ syntax │ │ format │ │ format │
    └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
        │           │           │          │           │           │
        ▼           ▼           ▼          ▼           ▼           ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │RETRIEVE│ │RETRIEVE│ │RETRIEVE│ │RETRIEVE│ │RETRIEVE│ │RETRIEVE│
    │        │ │        │ │        │ │        │ │        │ │        │
    │47 items│ │83 items│ │29 items│ │23 items│ │15 items│ │12 items│
    └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
        │           │           │          │           │           │
        ▼           ▼           ▼          ▼           ▼           ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │SEMANTIC│ │SEMANTIC│ │SEMANTIC│ │SEMANTIC│ │SEMANTIC│ │SEMANTIC│
    │FILTER  │ │FILTER  │ │FILTER  │ │FILTER  │ │FILTER  │ │FILTER  │
    │        │ │        │ │        │ │        │ │        │ │        │
    │"Focus  │ │"Focus  │ │"Focus  │ │"Focus  │ │"Focus  │ │"Focus  │
    │on prod-│ │on mkt  │ │on late-│ │on      │ │on app- │ │on app- │
    │uct     │ │analysis│ │stage   │ │regula- │ │roval   │ │roval   │
    │launches│ │& comp  │ │trials" │ │tory    │ │decisns"│ │outcomes│
    │..."    │ │intel"  │ │        │ │outcomes│ │        │ │..."    │
    └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
        │           │           │          │           │           │
        ▼           ▼           ▼          ▼           ▼           ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │12 items│ │19 items│ │8 items │ │8 items │ │7 items │ │5 items │
    └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
        │           │           │          │           │           │
        └───────────┴───────────┘          └───────────┴───────────┘
                    │                                  │
                    ▼                                  ▼
        ┌─────────────────────────┐    ┌─────────────────────────┐
        │ CHANNEL 1 RESULTS       │    │ CHANNEL 2 RESULTS       │
        │ 39 unique articles      │    │ 20 unique articles      │
        │ (after deduplication)   │    │ (after deduplication)   │
        └─────────────────────────┘    └─────────────────────────┘
                    │                                  │
                    └──────────────┬───────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │   STREAM AGGREGATION        │
                    │   59 total unique articles  │
                    │                             │
                    │   → Scoring & Ranking       │
                    │   → Report Generation       │
                    └─────────────────────────────┘