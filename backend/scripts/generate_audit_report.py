"""Generate the full date loophole audit report from cached data."""
import json
import os

with open(os.path.join(os.path.dirname(__file__), '..', 'missed_articles_full_audit.json')) as f:
    articles = json.load(f)

lines = []
lines.append('# Date Loophole Audit: Full Historical Review')
lines.append('')
lines.append('**Date:** 2026-03-30')
lines.append('**Stream:** Asbestos and Talc Litigation (stream_id=10)')
lines.append('**Period audited:** January 25 - March 28, 2026 (all pipeline runs)')
lines.append('**Method:** Searched PubMed by EDAT (entry date) for full period, compared against wip_articles table')
lines.append('')
lines.append('---')
lines.append('')
lines.append('## Summary')
lines.append('')
lines.append('| Metric | Count |')
lines.append('|--------|-------|')
lines.append('| Articles found by EDAT search (Jan 25 - Mar 28) | 533 |')
lines.append('| Articles in wip_articles (stream 10) | 395 |')
lines.append('| Already captured | 264 |')
lines.append('| **Missed - never entered pipeline** | **269** |')
lines.append('| Miss rate | **50.5%** |')
lines.append('')
lines.append('**Half of all articles that should have been captured were missed by the DP-only search strategy.**')
lines.append('')
lines.append('---')
lines.append('')
lines.append('## Root Cause Breakdown')
lines.append('')
lines.append('| Failure Mode | Count | % of Missed |')
lines.append('|-------------|-------|-------------|')

no_day = sum(1 for a in articles if not a['has_day'] and not a['is_book'])
has_day = sum(1 for a in articles if a['has_day'] and not a['is_book'])
books = sum(1 for a in articles if a['is_book'])

lines.append(f'| Month-only PubDate (no day) - DP slots to 1st of month | {no_day} | {no_day*100/len(articles):.1f}% |')
lines.append(f'| Full PubDate but EDAT lag - article indexed after its DP window | {has_day} | {has_day*100/len(articles):.1f}% |')
lines.append(f'| Book articles (PubmedBookArticle) | {books} | {books*100/len(articles):.1f}% |')
lines.append('')
lines.append('---')
lines.append('')
lines.append('## Missed Articles by Pipeline Window (EDAT)')
lines.append('')
lines.append('Which weekly window each missed article *should* have fallen into (by EDAT):')
lines.append('')
lines.append('| Window | Missed | Pipeline Ran |')
lines.append('|--------|--------|-------------|')

windows = [
    ('Jan 25 - Jan 31', '2026-01-25', '2026-01-31', 'Feb 1'),
    ('Feb 01 - Feb 07', '2026-02-01', '2026-02-07', 'Feb 9'),
    ('Feb 08 - Feb 14', '2026-02-08', '2026-02-14', 'Feb 15'),
    ('Feb 15 - Feb 21', '2026-02-15', '2026-02-21', 'Feb 22'),
    ('Feb 22 - Feb 28', '2026-02-22', '2026-02-28', 'Mar 2'),
    ('Mar 01 - Mar 07', '2026-03-01', '2026-03-07', 'Mar 8'),
    ('Mar 08 - Mar 14', '2026-03-08', '2026-03-14', 'Mar 16'),
    ('Mar 15 - Mar 21', '2026-03-15', '2026-03-21', 'Mar 22'),
    ('Mar 22 - Mar 28', '2026-03-22', '2026-03-28', 'Mar 29'),
]

for label, start, end, ran in windows:
    count = sum(1 for a in articles if start <= a['edat'].replace('/', '-') <= end)
    lines.append(f'| {label} | {count} | {ran} |')

lines.append('')
lines.append('---')
lines.append('')
lines.append('## Fix Applied')
lines.append('')
lines.append('The pipeline now searches by `[EDAT]` (entry date) instead of `[DP]` (publication date).')
lines.append('EDAT is always present on every PubMed record and always has full Y/M/D precision.')
lines.append('This eliminates both failure modes:')
lines.append('- Month-only PubDates no longer cause articles to be slotted to the wrong week')
lines.append('- EDAT lag is a non-issue because we search by EDAT directly')
lines.append('')
lines.append('See [pubmed-dates-reference.md](pubmed-dates-reference.md) for full technical details.')
lines.append('')
lines.append('---')
lines.append('')
lines.append('## All Missed Articles')
lines.append('')
lines.append('| PMID | PubDate | Issue | EDAT | Journal | Title |')
lines.append('|------|---------|-------|------|---------|-------|')

for a in articles:
    day_flag = '' if a['has_day'] else 'NO DAY'
    if a['is_book']:
        day_flag = 'BOOK'
    title = a['title'].replace('|', '/').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    journal = a['journal'].replace('|', '/').replace('&amp;', '&')
    lines.append(f'| {a["pmid"]} | {a["pubdate"]} | {day_flag} | {a["edat"]} | {journal[:40]} | {title[:70]} |')

lines.append('')
lines.append('---')
lines.append('')
lines.append('## Methodology')
lines.append('')
lines.append("1. Retrieved the stream's search query from `research_streams.retrieval_config` (stream_id=10)")
lines.append('2. Searched PubMed E-utilities using `[EDAT]` for the full period Jan 25 - Mar 28, 2026')
lines.append('3. Retrieved 533 PMIDs')
lines.append('4. Queried production `wip_articles` table for all PMIDs in stream 10')
lines.append('5. Computed set difference: 533 - 264 already captured = 269 missed')
lines.append('6. Fetched article metadata from PubMed to classify failure mode')

output_path = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', '_specs', 'search', 'date-loophole-audit-full-2026-03-30.md'))
with open(output_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

print(f'Report written to {output_path}')
print(f'{len(articles)} articles, {len(lines)} lines')
