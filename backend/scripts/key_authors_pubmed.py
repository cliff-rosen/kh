"""
Fetch recent PubMed articles for key authors and display in articles-table format.
Usage: python scripts/key_authors_pubmed.py
"""
import asyncio
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import json
import sys

# Fix Windows console encoding
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

KEY_AUTHORS = [
    "Victor Roggli",
    "Michele Carbone",
    "Raffit Hassan",
    "Attanoos RL",
    "Joseph R Testa",
    "Dennis Paustenbach",
    "Samuel P Hammar",
    "Ronald F Dodson",
    "Richard L Kradin",
    "Arnold T Brody",
    "Marjorie Zauderer",
    "Hedy Kindler",
    "Raphael Bueno",
]

MONTH_MAP = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


def parse_article(article_el):
    """Parse a <PubmedArticle> element into a dict matching the articles table schema."""
    medline = article_el.find("MedlineCitation")
    if medline is None:
        return None

    pmid_el = medline.find("PMID")
    pmid = pmid_el.text if pmid_el is not None else None

    article = medline.find("Article")
    if article is None:
        return None

    # Title
    title_el = article.find("ArticleTitle")
    title = "".join(title_el.itertext()).strip() if title_el is not None else ""

    # Journal
    journal_el = article.find("Journal/Title")
    journal = journal_el.text if journal_el is not None else None

    # Volume, Issue, Pages
    volume_el = article.find("Journal/JournalIssue/Volume")
    volume = volume_el.text if volume_el is not None else None

    issue_el = article.find("Journal/JournalIssue/Issue")
    issue = issue_el.text if issue_el is not None else None

    pages_el = article.find("Pagination/MedlinePgn")
    pages = pages_el.text if pages_el is not None else None

    medium_el = article.find("Journal/JournalIssue")
    medium = medium_el.get("CitedMedium") if medium_el is not None else None

    # Dates - honest precision
    pub_year, pub_month, pub_day = None, None, None
    pub_date = article.find("Journal/JournalIssue/PubDate")
    if pub_date is not None:
        y = pub_date.find("Year")
        if y is not None:
            pub_year = int(y.text)
        m = pub_date.find("Month")
        if m is not None:
            pub_month = MONTH_MAP.get(m.text, int(m.text) if m.text.isdigit() else None)
        d = pub_date.find("Day")
        if d is not None:
            pub_day = int(d.text)

    # Authors
    authors = []
    author_list = article.find("AuthorList")
    if author_list is not None:
        for auth in author_list.findall("Author"):
            last = auth.find("LastName")
            initials = auth.find("Initials")
            if last is not None:
                name = last.text
                if initials is not None:
                    name += " " + initials.text
                authors.append(name)

    # Abstract
    abstract_parts = []
    abstract_el = article.find("Abstract")
    if abstract_el is not None:
        for at in abstract_el.findall("AbstractText"):
            label = at.get("Label")
            text = "".join(at.itertext()).strip()
            if label:
                abstract_parts.append(f"**{label}**\n{text}")
            else:
                abstract_parts.append(text)
    abstract = "\n\n".join(abstract_parts) if abstract_parts else None

    # DOI and PMC ID
    doi, pmc_id = None, None
    pub_data = article_el.find("PubmedData")
    if pub_data is not None:
        for aid in pub_data.findall("ArticleIdList/ArticleId"):
            id_type = aid.get("IdType")
            if id_type == "doi":
                doi = aid.text
            elif id_type == "pmc":
                pmc_id = aid.text

    # Completion date
    comp_date = None
    dc = medline.find("DateCompleted")
    if dc is not None:
        cy = dc.find("Year")
        cm = dc.find("Month")
        cd = dc.find("Day")
        if cy is not None and cm is not None and cd is not None:
            comp_date = f"{cy.text}-{cm.text}-{cd.text}"

    url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else None

    return {
        "pmid": pmid,
        "title": title,
        "url": url,
        "authors": authors,
        "abstract": abstract,
        "journal": journal,
        "volume": volume,
        "issue": issue,
        "pages": pages,
        "medium": medium,
        "doi": doi,
        "pub_year": pub_year,
        "pub_month": pub_month,
        "pub_day": pub_day,
        "comp_date": comp_date,
    }


async def search_author(client: httpx.AsyncClient, author: str, min_date: str, max_date: str):
    """Search PubMed for an author's articles in a date range."""
    query = f"{author}[Author]"
    params = {
        "db": "pubmed",
        "term": query,
        "retmode": "json",
        "retmax": 100,
        "mindate": min_date,
        "maxdate": max_date,
        "datetype": "pdat",
    }
    resp = await client.get(ESEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    id_list = data.get("esearchresult", {}).get("idlist", [])
    total = int(data.get("esearchresult", {}).get("count", 0))
    return id_list, total


async def fetch_articles(client: httpx.AsyncClient, pmids: list[str]):
    """Fetch full article details for a list of PMIDs."""
    if not pmids:
        return []
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
    }
    resp = await client.get(EFETCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    articles = []
    for art_el in root.findall("PubmedArticle"):
        parsed = parse_article(art_el)
        if parsed:
            articles.append(parsed)
    return articles


def format_date(year, month, day):
    """Format a date with only available precision."""
    if not year:
        return "-"
    month_names = {1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
                   7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec"}
    if month and day:
        return f"{month_names.get(month, month)} {day}, {year}"
    if month:
        return f"{month_names.get(month, month)} {year}"
    return str(year)


async def main():
    one_year_ago = datetime.now() - timedelta(days=365)
    min_date = one_year_ago.strftime("%Y/%m/%d")
    max_date = datetime.now().strftime("%Y/%m/%d")

    print(f"Searching PubMed for {len(KEY_AUTHORS)} key authors")
    print(f"Date range: {min_date} to {max_date}")
    print("=" * 80)

    all_articles = []
    seen_pmids = set()

    async with httpx.AsyncClient() as client:
        for author in KEY_AUTHORS:
            pmids, total = await search_author(client, author, min_date, max_date)
            print(f"\n{author}: {total} articles found, fetching {len(pmids)}...")

            if pmids:
                await asyncio.sleep(1)
                articles = await fetch_articles(client, pmids)
                for art in articles:
                    if art["pmid"] not in seen_pmids:
                        art["_searched_author"] = author
                        seen_pmids.add(art["pmid"])
                        all_articles.append(art)

            # Be polite to NCBI (no API key = 3 req/sec max)
            await asyncio.sleep(2)

    # Sort by date (newest first)
    all_articles.sort(key=lambda a: (a["pub_year"] or 0, a["pub_month"] or 0, a["pub_day"] or 0), reverse=True)

    print(f"\n{'=' * 80}")
    print(f"TOTAL: {len(all_articles)} unique articles")
    print(f"{'=' * 80}\n")

    for i, art in enumerate(all_articles, 1):
        date_str = format_date(art["pub_year"], art["pub_month"], art["pub_day"])
        author_str = ", ".join(art["authors"][:5])
        if len(art["authors"]) > 5:
            author_str += f" ... (+{len(art['authors']) - 5} more)"

        print(f"--- Article {i} ---")
        print(f"  PMID:    {art['pmid']}")
        print(f"  Title:   {art['title']}")
        print(f"  Authors: {author_str}")
        print(f"  Journal: {art['journal']}")
        print(f"  Date:    {date_str}")
        print(f"  DOI:     {art['doi'] or '-'}")
        print(f"  Vol/Iss: {art['volume'] or '-'} / {art['issue'] or '-'}")
        print(f"  Pages:   {art['pages'] or '-'}")
        print(f"  URL:     {art['url']}")
        print(f"  Found via: {art['_searched_author']}")
        print()

    # Also dump as JSON for downstream use
    output_path = "scripts/key_authors_articles.json"
    json_articles = []
    for art in all_articles:
        a = dict(art)
        del a["_searched_author"]
        json_articles.append(a)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(json_articles, f, indent=2, ensure_ascii=False)
    print(f"JSON output saved to {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
