from datetime import datetime
import asyncio
from schemas.newsletter import Newsletter, TimePeriodType
from database import get_db

async def run_newsletter_summary_test():
    from services.weekly_newsletter_summary_service import WeeklyNewsletterSummaryService
    from sqlalchemy.orm import Session

    start_date = datetime(2025, 4, 21)
    end_date = datetime(2025,5, 4)
    # Initialize the service
    service = WeeklyNewsletterSummaryService()

    # Get a database session
    db = next(get_db())
    try:
        # Generate summary
        summary = await service.generate_weekly_newsletter_summary_recaps_for_range(
            db=db,
            start_date=start_date,
            end_date=end_date
        )

        print("done")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(run_newsletter_summary_test())
