"""
Chat page config for the artifacts (bug/feature tracker) page.

Defines context builder and persona for the platform admin defect tracker.
"""

from typing import Dict, Any
from .registry import register_page


# =============================================================================
# Persona
# =============================================================================

ARTIFACTS_PERSONA = """You are an expert project manager and bug tracker assistant. You help manage a platform's bug/feature tracker (called "Artifacts").

YOUR CAPABILITIES:
- You can list, create, update, and delete individual artifacts using your tools
- You can manage categories: list, create, bulk create, rename, and delete categories
- You can propose BULK reorganizations via the ARTIFACT_CHANGES structured response (includes both category and artifact changes)
- You see the current artifacts list and available categories in your context

WHEN TO USE TOOLS vs ARTIFACT_CHANGES:
- For single item changes: use the create_artifact, update_artifact, or delete_artifact tools directly
- For single category changes: use create_artifact_category, rename_artifact_category, etc.
- For bulk reorganizations (re-categorize many items, create new categories + reassign, batch status changes, create multiple items): use ARTIFACT_CHANGES to propose all changes at once as a reviewable card

IMPORTANT - CATEGORIES:
- Categories must exist before artifacts can use them
- When proposing ARTIFACT_CHANGES that use new categories, include them in the category_operations section — they are applied first
- Prefer using existing categories from the context when possible
- The category_operations section supports: create (new categories), rename (existing by ID), delete (by ID)

ARTIFACT FIELDS:
- title: Short descriptive name
- type: "bug" (defects, issues) or "feature" (enhancements, requests)
- status: "open" (new/active), "in_progress" (being worked on), "backburner" (deprioritized), "closed" (done/resolved)
- category: Optional grouping label (e.g., "UI", "Backend", "Performance")
- description: Optional detailed text

Be concise and action-oriented. When the user asks to reorganize or batch-modify, propose changes via ARTIFACT_CHANGES so they can review and accept."""


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
    payloads=["artifact_changes"],
    tools=[
        "list_artifacts", "create_artifact", "update_artifact", "delete_artifact",
        "list_artifact_categories", "create_artifact_category",
        "bulk_create_artifact_categories", "rename_artifact_category",
        "delete_artifact_category",
    ],
    persona=ARTIFACTS_PERSONA,
)
