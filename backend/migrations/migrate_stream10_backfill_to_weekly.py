"""
Migrate articles from the two Stream 10 (Asbestos and Talc Litigation) backfill
reports into their correct weekly reports.

Context:
  - Report 136 "Feb Backfill" (25 articles) and report 137 "Mar Backfill" (22 articles)
    contain articles that should have been surfaced by the weekly pipelines for
    Feb/Mar 2026 but were missed — mostly because of non-deterministic semantic
    filter scoring (same prompt/model/threshold scored the same article 0.1 one
    week and 0.8 the next).
  - This migration relocates each article's report_article_associations row to
    the weekly report whose date range contains the article's entry_date, and
    rebuilds wip_articles so each weekly report's audit trail is self-contained.

What it does for each of the 47 articles:
  1. Maps article.entry_date -> target weekly report (using pipeline_executions
     start_date/end_date).
  2. wip_articles handling:
     - Path A: weekly pipeline already has a wip_article for this PMID (8 cases,
       all previously filtered out). UPDATE the existing row with the backfill
       filter_score, filter_score_reason, set passed_semantic_filter=1 and
       included_in_report=1, and record provenance in article_metadata.
     - Path B: weekly pipeline has no wip_article for this PMID (39 cases).
       INSERT a new wip_article into the weekly pipeline_execution, copying all
       fields from the backfill wip_article, but with retrieval_group_id set to
       'backfill-migrated-<backfill_report_id>' so these rows are distinguishable
       from genuine weekly-pipeline retrievals.
  3. Inserts a new report_article_associations row on the weekly report,
     carrying over relevance_score, relevance_rationale, ranking, ai_summary,
     presentation_categories, ai_enrichments, is_hidden. Ranking is appended to
     the end of the existing weekly report rankings (MAX + 1, +2, ...).

Cleanup (after the 47 articles are relocated):
  - DELETE report_article_associations for report_ids 136, 137.
  - DELETE wip_articles whose pipeline_execution_id is one of the two backfill
    executions.
  - DELETE reports 136, 137.
  - DELETE the two backfill pipeline_executions.

NOT handled automatically:
  - Report enrichments (key_highlights, thematic_analysis, enrichments,
    coverage_stats) on the target weekly reports will become stale. The script
    prints a list of affected report_ids at the end so they can be regenerated.

Dry-run is the default. Pass --apply to write changes.
Transaction is atomic — either everything commits or nothing does.

Run:
    ENVIRONMENT=production python -m migrations.migrate_stream10_backfill_to_weekly
    ENVIRONMENT=production python -m migrations.migrate_stream10_backfill_to_weekly --apply
"""

import argparse
import json
import logging
import sys
from datetime import datetime, date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import SessionLocal

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

BACKFILL_REPORT_IDS = [136, 137]
STREAM_ID = 10


def load_plan(db):
    """Gather everything needed to execute the migration into a plan list."""

    backfill_execs = db.execute(text("""
        SELECT r.report_id, r.pipeline_execution_id
        FROM reports r
        WHERE r.report_id IN :rids
    """), {"rids": tuple(BACKFILL_REPORT_IDS)}).fetchall()
    backfill_exec_ids = [row[1] for row in backfill_execs]
    backfill_exec_by_report = {row[0]: row[1] for row in backfill_execs}

    weekly_reports = db.execute(text("""
        SELECT r.report_id, r.report_name, r.pipeline_execution_id,
               pe.start_date, pe.end_date
        FROM reports r
        JOIN pipeline_executions pe ON r.pipeline_execution_id = pe.id
        WHERE r.research_stream_id = :sid
          AND r.report_id NOT IN :rids
        ORDER BY pe.start_date
    """), {"sid": STREAM_ID, "rids": tuple(BACKFILL_REPORT_IDS)}).fetchall()

    def as_date(v):
        if isinstance(v, date):
            return v
        return datetime.strptime(str(v), "%Y-%m-%d").date()

    def find_weekly(entry_date):
        ed = as_date(entry_date)
        for rep_id, name, exec_id, start, end in weekly_reports:
            if as_date(start) <= ed <= as_date(end):
                return rep_id, name, exec_id
        return None

    # Pull each backfill article with all the data needed to rebuild it.
    backfill_articles = db.execute(text("""
        SELECT ra.report_id      AS bf_report_id,
               ra.article_id,
               a.pmid,
               a.entry_date,
               ra.is_hidden,
               ra.relevance_score,
               ra.relevance_rationale,
               ra.ranking,
               ra.ai_summary,
               ra.presentation_categories,
               ra.ai_enrichments,
               ra.wip_article_id    AS bf_wip_id
        FROM report_article_associations ra
        JOIN articles a ON a.article_id = ra.article_id
        WHERE ra.report_id IN :rids
        ORDER BY ra.report_id, ra.ranking
    """), {"rids": tuple(BACKFILL_REPORT_IDS)}).fetchall()

    plan = []
    unmapped = []

    for row in backfill_articles:
        bf_report_id = row[0]
        article_id = row[1]
        pmid = row[2]
        entry_date = row[3]

        if entry_date is None:
            unmapped.append((bf_report_id, article_id, pmid, "no entry_date"))
            continue

        target = find_weekly(entry_date)
        if target is None:
            unmapped.append((bf_report_id, article_id, pmid,
                             f"entry_date {entry_date} outside all weekly ranges"))
            continue

        target_report_id, target_report_name, target_exec_id = target

        # Pull backfill wip_article (so Path B can clone it).
        bf_wip = db.execute(text("""
            SELECT research_stream_id, source_id, title, url, authors, abstract,
                   summary, full_text, pub_year, pub_month, pub_day, entry_date,
                   pmid, doi, journal, volume, issue, pages, source_specific_id,
                   article_metadata, is_duplicate, duplicate_of_id, duplicate_of_pmid,
                   filter_score, filter_score_reason
            FROM wip_articles WHERE id = :wid
        """), {"wid": row[11]}).fetchone()

        # Does the target weekly pipeline already have a wip_article for this PMID?
        existing_weekly_wip = None
        if pmid:
            existing_weekly_wip = db.execute(text("""
                SELECT id, filter_score, filter_score_reason, article_metadata
                FROM wip_articles
                WHERE pipeline_execution_id = :eid AND pmid = :pmid
                LIMIT 1
            """), {"eid": target_exec_id, "pmid": pmid}).fetchone()

        plan.append({
            "bf_report_id": bf_report_id,
            "article_id": article_id,
            "pmid": pmid,
            "entry_date": entry_date,
            "target_report_id": target_report_id,
            "target_report_name": target_report_name,
            "target_exec_id": target_exec_id,
            "path": "A" if existing_weekly_wip else "B",
            "existing_weekly_wip": existing_weekly_wip,
            "bf_wip": bf_wip,
            "assoc": {
                "is_hidden": row[4],
                "relevance_score": row[5],
                "relevance_rationale": row[6],
                "ranking": row[7],
                "ai_summary": row[8],
                "presentation_categories": row[9],
                "ai_enrichments": row[10],
            },
        })

    return plan, unmapped, backfill_exec_ids, backfill_exec_by_report


def print_plan(plan, unmapped, backfill_exec_ids):
    logger.info("=" * 70)
    logger.info("MIGRATION PLAN")
    logger.info("=" * 70)

    by_target = {}
    for item in plan:
        by_target.setdefault(item["target_report_id"], []).append(item)

    for rid in sorted(by_target):
        items = by_target[rid]
        name = items[0]["target_report_name"]
        path_a = sum(1 for i in items if i["path"] == "A")
        path_b = sum(1 for i in items if i["path"] == "B")
        logger.info(f"  -> Report {rid} ({name}): {len(items)} articles "
                    f"[Path A update: {path_a}, Path B insert: {path_b}]")

    logger.info(f"Total articles to migrate: {len(plan)}")
    path_a_total = sum(1 for i in plan if i["path"] == "A")
    path_b_total = sum(1 for i in plan if i["path"] == "B")
    logger.info(f"  Path A (update existing weekly wip_article): {path_a_total}")
    logger.info(f"  Path B (insert new weekly wip_article):      {path_b_total}")

    if unmapped:
        logger.warning(f"{len(unmapped)} articles could NOT be mapped:")
        for u in unmapped:
            logger.warning(f"  bf_report={u[0]} article={u[1]} pmid={u[2]} reason={u[3]}")
    logger.info(f"Backfill pipeline_executions to delete: {backfill_exec_ids}")
    logger.info("=" * 70)


def execute_plan(db, plan, backfill_exec_ids, apply):
    # Cache next-ranking per target report so we can append in order.
    next_ranking = {}
    for item in plan:
        tid = item["target_report_id"]
        if tid not in next_ranking:
            row = db.execute(text("""
                SELECT COALESCE(MAX(ranking), 0) + 1
                FROM report_article_associations
                WHERE report_id = :rid
            """), {"rid": tid}).fetchone()
            next_ranking[tid] = row[0]

    migrated_at = datetime.utcnow().isoformat()

    for item in plan:
        target_rid = item["target_report_id"]
        target_exec = item["target_exec_id"]
        article_id = item["article_id"]
        bf_rid = item["bf_report_id"]
        assoc = item["assoc"]

        if item["path"] == "A":
            existing = item["existing_weekly_wip"]
            wip_id = existing[0]
            prior_md = existing[3]
            if isinstance(prior_md, str):
                try:
                    prior_md = json.loads(prior_md)
                except Exception:
                    prior_md = {}
            prior_md = prior_md or {}
            prior_md["revised_by_backfill"] = {
                "source_backfill_report_id": bf_rid,
                "original_filter_score": existing[1],
                "original_filter_score_reason": existing[2],
                "migrated_at": migrated_at,
            }

            db.execute(text("""
                UPDATE wip_articles
                SET passed_semantic_filter = 1,
                    included_in_report = 1,
                    filter_score = :score,
                    filter_score_reason = :reason,
                    article_metadata = :meta
                WHERE id = :wid
            """), {
                "score": item["bf_wip"][23],
                "reason": item["bf_wip"][24],
                "meta": json.dumps(prior_md),
                "wid": wip_id,
            })
        else:
            bf = item["bf_wip"]
            res = db.execute(text("""
                INSERT INTO wip_articles (
                    research_stream_id, retrieval_group_id, source_id,
                    pipeline_execution_id, title, url, authors, abstract,
                    summary, full_text, pub_year, pub_month, pub_day,
                    entry_date, pmid, doi, journal, volume, issue, pages,
                    source_specific_id, article_metadata, is_duplicate,
                    duplicate_of_id, duplicate_of_pmid, passed_semantic_filter,
                    filter_score, filter_score_reason, included_in_report,
                    retrieved_at, created_at
                ) VALUES (
                    :research_stream_id, :retrieval_group_id, :source_id,
                    :pipeline_execution_id, :title, :url, :authors, :abstract,
                    :summary, :full_text, :pub_year, :pub_month, :pub_day,
                    :entry_date, :pmid, :doi, :journal, :volume, :issue, :pages,
                    :source_specific_id, :article_metadata, :is_duplicate,
                    :duplicate_of_id, :duplicate_of_pmid, 1,
                    :filter_score, :filter_score_reason, 1,
                    NOW(), NOW()
                )
            """), {
                "research_stream_id": bf[0],
                "retrieval_group_id": f"backfill-migrated-{bf_rid}",
                "source_id": bf[1],
                "pipeline_execution_id": target_exec,
                "title": bf[2],
                "url": bf[3],
                "authors": json.dumps(bf[4]) if bf[4] is not None and not isinstance(bf[4], str) else bf[4],
                "abstract": bf[5],
                "summary": bf[6],
                "full_text": bf[7],
                "pub_year": bf[8],
                "pub_month": bf[9],
                "pub_day": bf[10],
                "entry_date": bf[11],
                "pmid": bf[12],
                "doi": bf[13],
                "journal": bf[14],
                "volume": bf[15],
                "issue": bf[16],
                "pages": bf[17],
                "source_specific_id": bf[18],
                "article_metadata": json.dumps(bf[19]) if bf[19] is not None and not isinstance(bf[19], str) else bf[19],
                "is_duplicate": bf[20],
                "duplicate_of_id": bf[21],
                "duplicate_of_pmid": bf[22],
                "filter_score": bf[23],
                "filter_score_reason": bf[24],
            })
            wip_id = res.lastrowid

        ranking = next_ranking[target_rid]
        next_ranking[target_rid] += 1

        db.execute(text("""
            INSERT INTO report_article_associations (
                report_id, article_id, wip_article_id,
                is_hidden, relevance_score, relevance_rationale,
                ranking, ai_summary, presentation_categories,
                ai_enrichments, curator_added, added_at
            ) VALUES (
                :report_id, :article_id, :wip_article_id,
                :is_hidden, :relevance_score, :relevance_rationale,
                :ranking, :ai_summary, :presentation_categories,
                :ai_enrichments, 0, NOW()
            )
        """), {
            "report_id": target_rid,
            "article_id": article_id,
            "wip_article_id": wip_id,
            "is_hidden": assoc["is_hidden"],
            "relevance_score": assoc["relevance_score"],
            "relevance_rationale": assoc["relevance_rationale"],
            "ranking": ranking,
            "ai_summary": assoc["ai_summary"],
            "presentation_categories": (
                json.dumps(assoc["presentation_categories"])
                if assoc["presentation_categories"] is not None
                and not isinstance(assoc["presentation_categories"], str)
                else assoc["presentation_categories"]
            ),
            "ai_enrichments": (
                json.dumps(assoc["ai_enrichments"])
                if assoc["ai_enrichments"] is not None
                and not isinstance(assoc["ai_enrichments"], str)
                else assoc["ai_enrichments"]
            ),
        })

    # Cleanup: remove backfill associations, wip_articles, reports, and
    # pipeline_executions. Order matters because of FKs:
    #   reports.pipeline_execution_id -> pipeline_executions.id
    #   pipeline_executions.report_id -> reports.report_id   (circular!)
    # Break the cycle by NULLing pipeline_executions.report_id first.
    db.execute(text("""
        DELETE FROM report_article_associations WHERE report_id IN :rids
    """), {"rids": tuple(BACKFILL_REPORT_IDS)})

    db.execute(text("""
        DELETE FROM wip_articles WHERE pipeline_execution_id IN :eids
    """), {"eids": tuple(backfill_exec_ids)})

    db.execute(text("""
        UPDATE pipeline_executions SET report_id = NULL WHERE id IN :eids
    """), {"eids": tuple(backfill_exec_ids)})

    db.execute(text("""
        DELETE FROM reports WHERE report_id IN :rids
    """), {"rids": tuple(BACKFILL_REPORT_IDS)})

    db.execute(text("""
        DELETE FROM pipeline_executions WHERE id IN :eids
    """), {"eids": tuple(backfill_exec_ids)})

    affected_reports = sorted({item["target_report_id"] for item in plan})
    logger.info("")
    logger.info("WARNING: the following weekly reports now have additional articles")
    logger.info("and their enrichments (key_highlights, thematic_analysis,")
    logger.info("enrichments, coverage_stats) are stale. Regenerate manually:")
    for rid in affected_reports:
        logger.info(f"  - report_id {rid}")

    if apply:
        db.commit()
        logger.info("APPLIED: changes committed.")
    else:
        db.rollback()
        logger.info("DRY RUN: rolled back, no changes written.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true",
                        help="Actually commit changes. Default is dry-run.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        plan, unmapped, backfill_exec_ids, _ = load_plan(db)
        print_plan(plan, unmapped, backfill_exec_ids)

        if unmapped:
            logger.error("Refusing to proceed: some articles could not be mapped.")
            sys.exit(1)

        if not plan:
            logger.info("Nothing to migrate.")
            return

        execute_plan(db, plan, backfill_exec_ids, apply=args.apply)
    except Exception:
        db.rollback()
        logger.exception("Migration failed, rolled back.")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
