# Knowledge Horizon — Fact Base for Terms of Service

This document captures the factual state of the Knowledge Horizon platform as of the current production deployment. It is intended as background material for drafting a Terms of Service. All claims below are verified against the live codebase; gaps and "we don't have this" items are called out explicitly.

---

## 1. What the product is

Knowledge Horizon is a B2B litigation-intelligence platform. Its current focus is asbestos and talc toxic-tort litigation. The service:

- Monitors the PubMed biomedical literature database (run by the U.S. National Library of Medicine) on a recurring schedule (typically weekly).
- Uses AI to filter, categorize, summarize, and assess the litigation implications of newly published articles.
- Delivers curated reports to subscribed users via the web app and via email.
- Provides an in-app AI assistant ("Ira") that users can ask questions of, scoped to their reports and articles.

The platform is **invitation-only**. There is no self-serve public signup. Users obtain access via an administrator invitation. The landing page offers a "Request Access" form that creates a record in an internal queue; an administrator manually reviews and invites approved users.

---

## 2. User-facing features

| Feature | Description |
|---|---|
| Research Streams | User- or admin-configured monitoring topics. Each stream defines what to search for, how to filter, and how to categorize results. |
| Weekly/Periodic Reports | AI-generated, human-approved curated reports containing an executive summary, category-level summaries, ranked articles with AI summaries, and (where applicable) stance analysis. |
| Ira (AI Chat) | Conversational AI assistant that can answer questions about specific articles, reports, and platform usage. |
| Article Curation | Users can star articles (private), add personal or shared notes, and provide thumbs-up/thumbs-down/important/irrelevant feedback. |
| Email Delivery | Reports are queued and delivered by email on a configurable schedule. |
| Admin Tools | Org admins manage members; platform admins manage organizations, global streams, approve/reject reports, edit AI-generated content. |

---

## 3. Personal data collected and stored

**Account data (per user)**
- Email address, full name, job title, password (bcrypt-hashed), registration timestamp.
- Organization membership and role.

**Authentication artifacts**
- One-time login tokens (30-minute expiration).
- Password reset tokens (with stored expiration timestamp; cleared on use or successful login).
- JWT access tokens (60-minute expiration).

**Activity data**
- `UserEvent` table: API calls and frontend actions (event type, event payload, timestamp).
- `ToolTrace` table: long-running tool invocations with inputs, progress, and results.
- `Conversation` and `Message` tables: full chat history with the AI assistant, retained indefinitely.

**Curation data**
- Starred articles (per user, per article).
- Personal notes (private to author).
- Shared notes (visible to author's organization).
- Feedback on articles and reports.
- Read/unread state on reports.

**Access request data**
- Name, email, optional company, status, optional admin notes — for the "Request Access" form.

---

## 4. Third-party services

**LLM providers (used to generate the AI content shown to users)**
- **OpenAI** — GPT-5, GPT-5-mini, GPT-5-nano, GPT-4.1. Used for semantic filtering, categorization, summaries, stance analysis, and chat.
- **Anthropic** — Claude models are configured but optional.

User-submitted content (chat messages, search criteria) is sent to these third-party APIs as part of normal operation.

**Data sources**
- **PubMed (NIH E-Utilities)** — primary source of all scientific articles, abstracts, and (where available) full text from PubMed Central.
- **Google Search API / SerpAPI** — optional, for web-augmented retrieval.
- **Google Scholar** — optional, for scholarly cross-referencing.

**Email delivery**
- Outbound email sent via SMTP. Credentials and sender address configured by environment.

**Hosting and storage**
- AWS Elastic Beanstalk for compute.
- AWS RDS (MariaDB / MySQL-compatible) for the database.
- AWS S3 for the static frontend.
- All data resides in a single MariaDB instance, multi-tenant via `org_id` foreign keys.

**No third-party analytics or ad trackers are integrated.** All user-event tracking is internal.

---

## 5. AI-generated content shown to users

The platform produces and displays the following AI-generated content:

- **Article-level AI summaries** — concise summaries of individual articles.
- **Category-level summaries** — synthesis of articles within a configured category.
- **Executive summaries** — top-level synthesis for each report.
- **Stance analysis** — classification of each article as pro-defense, pro-plaintiff, neutral, mixed, or unclear, with a written rationale.
- **Relevance scores and rationales** — 0.0–1.0 scores with reasoning for each article's inclusion or exclusion.
- **Categorization** — automatic assignment of articles to user-defined categories.
- **Chat responses** — Ira's answers, grounded in (but not limited to) the user's articles.

**Important distinction for ToS drafting:**
- The landing page FAQ states: *"Every citation is verified — nothing is fabricated or hallucinated."* This claim refers to **article metadata** (title, authors, journal, PMID, DOI), which is fetched directly from PubMed and not invented. It does not extend to AI-generated summaries, scores, stance classifications, or chat responses, which are produced by LLMs and may contain errors or misinterpretations.
- All reports pass through a human approval workflow (`AWAITING_APPROVAL` → `APPROVED` / `REJECTED`) before becoming visible to subscribers. Reports can be edited by curators. Individual AI-generated summaries within an approved report are not independently fact-checked against the original papers.

---

## 6. User roles

| Role | Scope |
|---|---|
| `PLATFORM_ADMIN` | Cross-organization. Manages organizations, users, global streams, and report approval. |
| `ORG_ADMIN` | Within one organization. Manages members and stream subscriptions. |
| `MEMBER` | Within one organization. Uses subscribed streams, creates personal streams, curates articles. |

---

## 7. Multi-tenancy and data isolation

Users belong to an `Organization`. The architecture isolates data along the following lines:

- **Private to user**: starred articles, personal notes, password and tokens, chat history.
- **Shared within organization**: shared notes, organization-scoped research streams, reports for subscribed streams.
- **Global (cross-org)**: global research streams created by platform admins; organizations subscribe to make them visible to their members.

Cross-organization data leakage is prevented by org-scoped queries; users cannot see another organization's notes, starred items, or non-global streams.

---

## 8. Account creation and authentication

**Sign-up paths**
1. **Public access request form** (landing page and login screen) — submits name, email, optional company. Stored in the `access_requests` table for admin review. No account is created at this step.
2. **Invitation-based registration** — admin issues an invitation token; the recipient visits a registration link, sets a password, and is provisioned into the specified organization with the specified role.
3. **Default-org fallback** — registration without an invitation token assigns the user to a default organization with the `MEMBER` role. (This path exists in the code; whether it is exposed to end users is a deployment-level decision.)

**Authentication**
- Email + password (bcrypt-hashed).
- Email-link login (one-time 30-minute token).
- Password reset via email-delivered token.
- JWT bearer tokens for API auth, 60-minute default expiration.

The login screen does not accept self-serve registration; it directs unauthenticated visitors to the access-request form.

---

## 9. Payment, billing, subscriptions

**The platform has no payment processing.** There is no Stripe integration, no billing system, no subscription tier model, no pricing page, and no paywall. The word "subscription" in the codebase refers to access subscriptions to research streams (an authorization concept), not paid subscriptions.

The landing page mentions "free trial" in the FAQ; in practice, access is granted gratis at administrator discretion.

---

## 10. Email and other communications

The system sends the following automated emails:

1. **Invitation emails** — admin-triggered, contains an invitation link.
2. **Login token emails** — user-triggered, contains a one-time link.
3. **Password reset emails** — user-triggered, contains a reset link.
4. **Report delivery emails** — scheduled per stream, contains the curated report.

There is no general-purpose marketing email mechanism. There is no transactional email beyond the four above.

---

## 11. User-uploaded content

**The platform does not accept arbitrary user uploads** (no file uploads, no rich-content posting). User-generated data is limited to:
- Stream configuration (search terms, category definitions, prompts).
- Notes on articles (free text, personal or org-shared).
- Chat messages to Ira.
- Feedback (structured: stars, thumbs-up/down, importance flags).

All article content originates from PubMed and is not authored by users.

---

## 12. Deletion, data portability, retention

**Currently absent from the platform:**
- No self-serve account deletion.
- No self-serve data export.
- No data retention policy enforced in code (chat history, events, and tool traces persist indefinitely).
- No account deactivation endpoint.

Deletion of an account or any associated data currently requires direct database action by a platform administrator. **This is a known gap that the ToS will need to either disclose or commit to addressing.** Likely relevant for GDPR (right to erasure, right to data portability) and CCPA equivalents if the platform serves users in those jurisdictions.

---

## 13. Rate limits, quotas, fair use

There are no per-user rate limits or quotas implemented. System-wide configuration limits exist (e.g., max articles per pipeline run, max PubMed results per API call, max tool iterations per chat turn) but these are operational, not contractual.

---

## 14. Where data lives

- **Database**: AWS RDS, MariaDB engine. Single multi-tenant instance, organization-isolated by foreign keys.
- **Compute**: AWS Elastic Beanstalk (US region per current configuration; verify with deployment).
- **Static assets**: AWS S3 (`www.knowledgehorizon.ai`).
- **Backups**: managed by AWS RDS (default snapshot policy); verify retention period with deployment.

All user data, AI-generated content, chat history, and PubMed-derived article cache reside in this single database.

---

## 15. Specific items the ToS should likely address

These follow from the facts above and may need explicit treatment:

1. **AI content disclaimer** — summaries, scores, and Ira responses may contain inaccuracies. The platform's verified-citation claim covers metadata, not AI-generated text.
2. **Not legal advice** — the stance analysis and litigation-implication content is editorial, not legal advice. Users are practicing attorneys, but the platform does not establish a lawyer–client relationship.
3. **Third-party data flow disclosure** — user inputs (chat, search terms, article content) are transmitted to OpenAI and possibly Anthropic for processing.
4. **PubMed data usage** — content is sourced from PubMed (NIH); attribution and any redistribution conditions should be reviewed against NLM's data use terms.
5. **Account deletion / data export** — the gap identified in section 12 should be either disclosed or backed by a written commitment to honor manual requests.
6. **Retention** — chat history, tool traces, and event logs are retained indefinitely. The ToS should set or disclose a retention policy.
7. **Acceptable use** — given the chat interface, an acceptable-use clause covering prohibited prompts (extracting other users' data, jailbreaking, scraping, etc.) is advisable.
8. **No payment / no SLA** — since there is no paid tier, the ToS likely needs to establish that the service is provided as-is without uptime or accuracy commitments, while still recognizing that customers may have separate written agreements with stronger commitments.
9. **Multi-tenant data segregation** — the platform isolates orgs by FK; the ToS may want to describe this for enterprise buyers.
10. **AI training opt-out** — the platform's third-party LLM calls inherit those providers' default data-use terms (e.g., OpenAI's API by default does not train on inputs). Worth confirming and disclosing.

---

*Generated from a code-level audit. If anything in here looks wrong, it's worth verifying against the source — the codebase is the source of truth.*
