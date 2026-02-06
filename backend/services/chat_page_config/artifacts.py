"""
Chat page config for the artifacts (bug/feature tracker) page.

Defines context builder for the platform admin defect tracker.
"""

from typing import Dict, Any
from .registry import register_page


# =============================================================================
# Context Builder
# =============================================================================

def build_context(context: Dict[str, Any]) -> str:
    """Build context section for artifacts page."""
    artifacts = context.get("artifacts", [])
    categories = context.get("categories", [])
    filters = context.get("filters", {})
    selected_count = context.get("selected_count", 0)

    artifact_count = len(artifacts)

    if artifact_count == 0:
        return """The user is viewing the Artifacts page — a platform admin defect/feature tracker.

Current status: No artifacts found (may be filtered).

WHAT ARE ARTIFACTS:
Artifacts are bugs and feature requests tracked by platform admins. Each has a type (bug/feature),
status (open, in_progress, backburner, closed), an optional category for grouping, and a description.

You can help the user:
- Discuss priorities and triage strategy
- Suggest how to organize artifacts into categories
- Analyze patterns in their backlog
- Draft descriptions or acceptance criteria for new items"""

    # Count by status
    status_counts: Dict[str, int] = {}
    type_counts: Dict[str, int] = {}
    category_counts: Dict[str, int] = {}
    for a in artifacts:
        s = a.get("status", "unknown")
        t = a.get("artifact_type", "unknown")
        c = a.get("category") or "uncategorized"
        status_counts[s] = status_counts.get(s, 0) + 1
        type_counts[t] = type_counts.get(t, 0) + 1
        category_counts[c] = category_counts.get(c, 0) + 1

    status_summary = ", ".join(f"{v} {k}" for k, v in sorted(status_counts.items()))
    type_summary = ", ".join(f"{v} {k}s" for k, v in sorted(type_counts.items()))
    category_summary = ", ".join(f"{k}: {v}" for k, v in sorted(category_counts.items()))

    # Active filters
    filter_parts = []
    if filters.get("type"):
        filter_parts.append(f"type={filters['type']}")
    if filters.get("status"):
        filter_parts.append(f"status={filters['status']}")
    if filters.get("category"):
        filter_parts.append(f"category={filters['category']}")
    filter_text = f"Active filters: {', '.join(filter_parts)}" if filter_parts else "No filters active"

    # Build artifact list (limit to 20 for context)
    artifact_lines = []
    for a in artifacts[:20]:
        cat = f" [{a.get('category')}]" if a.get("category") else ""
        artifact_lines.append(
            f"  - [{a.get('artifact_type', '?').upper()}] {a.get('title', 'Untitled')} "
            f"({a.get('status', '?')}){cat}"
        )
    artifact_text = "\n".join(artifact_lines)
    more_text = f"\n  ... and {artifact_count - 20} more" if artifact_count > 20 else ""

    selected_text = f"\n\nUser has {selected_count} artifact(s) selected for bulk actions." if selected_count > 0 else ""

    category_list = ", ".join(c.get("name", "") for c in categories) if categories else "none defined"

    return f"""The user is viewing the Artifacts page — a platform admin defect/feature tracker.

{filter_text}
Total visible: {artifact_count} artifacts ({type_summary})
By status: {status_summary}
By category: {category_summary}
Available categories: {category_list}{selected_text}

ARTIFACTS:
{artifact_text}{more_text}

You can help the user:
- Triage and prioritize items
- Suggest category groupings
- Analyze patterns (e.g., many bugs in one area)
- Draft descriptions or acceptance criteria
- Recommend what to tackle next vs. backburner"""


# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="artifacts",
    context_builder=build_context,
)
