"""
Report Email Queue Service

Manages the email queue for scheduled report delivery.
- Queue entries for sending reports to subscribers
- Get subscribers for a report's stream
- Process queue (mark ready, send emails)
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, select, func
from sqlalchemy.orm import joinedload, selectinload
from typing import List, Optional, Tuple
from datetime import datetime, date
from fastapi import Depends

from models import (
    ReportEmailQueue, ReportEmailQueueStatus,
    Report, User, ResearchStream,
    OrgStreamSubscription, UserStreamSubscription,
    ApprovalStatus, StreamScope
)
from schemas.report_email_queue import (
    ReportEmailQueueCreate,
    ReportEmailQueue as ReportEmailQueueSchema,
    ReportEmailQueueWithDetails,
    BulkScheduleRequest,
    BulkScheduleResponse,
)
from database import get_async_db
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ProcessQueueResult:
    """Result of processing the email queue."""
    total_processed: int = 0
    sent_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0  # Already processed or not ready
    errors: List[str] = field(default_factory=list)


class ReportEmailQueueService:
    """Service for managing the report email queue."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== Queue Management ====================

    async def get_queue_entries(
        self,
        status_filter: Optional[ReportEmailQueueStatus] = None,
        scheduled_from: Optional[date] = None,
        scheduled_to: Optional[date] = None,
        report_id: Optional[int] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[ReportEmailQueueWithDetails], int]:
        """Get queue entries with optional filters."""

        # Build base query
        conditions = []

        if status_filter:
            conditions.append(ReportEmailQueue.status == status_filter)

        if scheduled_from:
            conditions.append(ReportEmailQueue.scheduled_for >= scheduled_from)

        if scheduled_to:
            conditions.append(ReportEmailQueue.scheduled_for <= scheduled_to)

        if report_id:
            conditions.append(ReportEmailQueue.report_id == report_id)

        # Get total count
        count_query = select(func.count(ReportEmailQueue.id))
        if conditions:
            count_query = count_query.where(and_(*conditions))
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Get entries with joins
        query = (
            select(ReportEmailQueue, Report, User, ResearchStream)
            .join(Report, ReportEmailQueue.report_id == Report.report_id)
            .join(User, ReportEmailQueue.user_id == User.user_id)
            .outerjoin(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
        )

        if conditions:
            query = query.where(and_(*conditions))

        query = (
            query
            .order_by(ReportEmailQueue.scheduled_for.desc(), ReportEmailQueue.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        result = await self.db.execute(query)
        rows = result.all()

        entries = []
        for queue_entry, report, user, stream in rows:
            entries.append(ReportEmailQueueWithDetails(
                id=queue_entry.id,
                report_id=queue_entry.report_id,
                user_id=queue_entry.user_id,
                email=queue_entry.email,
                status=queue_entry.status,
                scheduled_for=queue_entry.scheduled_for,
                created_at=queue_entry.created_at,
                updated_at=queue_entry.updated_at,
                sent_at=queue_entry.sent_at,
                error_message=queue_entry.error_message,
                report_name=report.report_name if report else None,
                user_full_name=user.full_name if user else None,
                stream_name=stream.stream_name if stream else None,
            ))

        return entries, total

    async def get_entry_by_id(self, entry_id: int) -> Optional[ReportEmailQueue]:
        """Get a single queue entry by ID."""
        result = await self.db.execute(
            select(ReportEmailQueue).where(ReportEmailQueue.id == entry_id)
        )
        return result.scalars().first()

    async def create_entry(self, data: ReportEmailQueueCreate) -> ReportEmailQueue:
        """Create a single queue entry."""
        entry = ReportEmailQueue(
            report_id=data.report_id,
            user_id=data.user_id,
            email=data.email,
            scheduled_for=data.scheduled_for,
            status=ReportEmailQueueStatus.SCHEDULED,
        )
        self.db.add(entry)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def check_duplicate(
        self,
        report_id: int,
        user_id: int,
        scheduled_for: date,
    ) -> bool:
        """Check if a duplicate entry exists (same report, user, date)."""
        result = await self.db.execute(
            select(ReportEmailQueue.id).where(
                and_(
                    ReportEmailQueue.report_id == report_id,
                    ReportEmailQueue.user_id == user_id,
                    ReportEmailQueue.scheduled_for == scheduled_for,
                    # Only check non-terminal statuses
                    ReportEmailQueue.status.in_([
                        ReportEmailQueueStatus.SCHEDULED,
                        ReportEmailQueueStatus.READY,
                        ReportEmailQueueStatus.PROCESSING,
                    ])
                )
            )
        )
        return result.scalars().first() is not None

    async def schedule_emails(
        self, request: BulkScheduleRequest
    ) -> BulkScheduleResponse:
        """
        Schedule emails for multiple users.
        Skips duplicates and users without emails.
        """
        # Get user emails
        result = await self.db.execute(
            select(User).where(User.user_id.in_(request.user_ids))
        )
        users = {u.user_id: u for u in result.scalars().all()}

        scheduled_entries = []
        skipped_count = 0

        for user_id in request.user_ids:
            user = users.get(user_id)

            # Skip if user not found or no email
            if not user or not user.email:
                skipped_count += 1
                logger.warning(f"Skipping user {user_id}: not found or no email")
                continue

            # Skip if duplicate exists
            if await self.check_duplicate(request.report_id, user_id, request.scheduled_for):
                skipped_count += 1
                logger.info(f"Skipping duplicate: report={request.report_id}, user={user_id}, date={request.scheduled_for}")
                continue

            # Create entry
            entry = ReportEmailQueue(
                report_id=request.report_id,
                user_id=user_id,
                email=user.email,
                scheduled_for=request.scheduled_for,
                status=ReportEmailQueueStatus.SCHEDULED,
            )
            self.db.add(entry)
            scheduled_entries.append(entry)

        if scheduled_entries:
            await self.db.commit()
            # Refresh all entries to get IDs
            for entry in scheduled_entries:
                await self.db.refresh(entry)

        logger.info(
            f"Scheduled {len(scheduled_entries)} emails for report {request.report_id}, "
            f"skipped {skipped_count}"
        )

        return BulkScheduleResponse(
            scheduled_count=len(scheduled_entries),
            skipped_count=skipped_count,
            queue_entries=[
                ReportEmailQueueSchema.model_validate(e) for e in scheduled_entries
            ],
        )

    async def cancel_entry(self, entry_id: int) -> bool:
        """
        Cancel a scheduled entry.
        Only works for scheduled/ready status.
        """
        entry = await self.get_entry_by_id(entry_id)

        if not entry:
            return False

        if entry.status not in [ReportEmailQueueStatus.SCHEDULED, ReportEmailQueueStatus.READY]:
            logger.warning(
                f"Cannot cancel entry {entry_id}: status is {entry.status}"
            )
            return False

        await self.db.delete(entry)
        await self.db.commit()

        logger.info(f"Cancelled email queue entry {entry_id}")
        return True

    async def update_status(
        self,
        entry_id: int,
        new_status: ReportEmailQueueStatus,
        error_message: Optional[str] = None,
    ) -> Optional[ReportEmailQueue]:
        """Update the status of a queue entry."""
        entry = await self.get_entry_by_id(entry_id)

        if not entry:
            return None

        entry.status = new_status

        if new_status == ReportEmailQueueStatus.SENT:
            entry.sent_at = datetime.utcnow()

        if error_message:
            entry.error_message = error_message

        await self.db.commit()
        await self.db.refresh(entry)

        return entry

    # ==================== Report & Subscriber Helpers ====================

    async def get_approved_reports(self, limit: int = 50) -> List[Report]:
        """Get approved reports for the dropdown."""
        result = await self.db.execute(
            select(Report)
            .where(Report.approval_status == ApprovalStatus.APPROVED)
            .order_by(Report.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_stream_subscribers(self, report_id: int) -> List[User]:
        """
        Get all users subscribed to the stream of a given report.

        Subscription rules:
        - Global streams: Users in orgs subscribed to the stream, who haven't opted out
        - Org streams: Users who have explicitly subscribed
        - Personal streams: Only the owner
        """
        # Get the report and its stream
        result = await self.db.execute(
            select(Report, ResearchStream)
            .join(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
            .where(Report.report_id == report_id)
        )
        row = result.first()

        if not row:
            return []

        report, stream = row

        if stream.scope == StreamScope.PERSONAL:
            # Personal stream: only the owner
            if stream.user_id:
                result = await self.db.execute(
                    select(User)
                    .options(selectinload(User.organization))
                    .where(
                        and_(User.user_id == stream.user_id, User.is_active == True)
                    )
                )
                user = result.scalars().first()
                return [user] if user else []
            return []

        elif stream.scope == StreamScope.ORGANIZATION:
            # Org stream: users who have explicitly subscribed
            result = await self.db.execute(
                select(User)
                .options(selectinload(User.organization))
                .join(UserStreamSubscription, User.user_id == UserStreamSubscription.user_id)
                .where(
                    and_(
                        UserStreamSubscription.stream_id == stream.stream_id,
                        UserStreamSubscription.is_subscribed == True,
                        User.is_active == True,
                    )
                )
            )
            return list(result.scalars().all())

        elif stream.scope == StreamScope.GLOBAL:
            # Global stream: users in subscribed orgs who haven't opted out
            # Step 1: Get all orgs subscribed to this stream
            org_result = await self.db.execute(
                select(OrgStreamSubscription.org_id).where(
                    OrgStreamSubscription.stream_id == stream.stream_id
                )
            )
            subscribed_org_ids = [r[0] for r in org_result.all()]

            if not subscribed_org_ids:
                return []

            # Step 2: Get users who have opted out
            opted_out_result = await self.db.execute(
                select(UserStreamSubscription.user_id).where(
                    and_(
                        UserStreamSubscription.stream_id == stream.stream_id,
                        UserStreamSubscription.is_subscribed == False,
                    )
                )
            )
            opted_out_user_ids = {r[0] for r in opted_out_result.all()}

            # Step 3: Get all active users in subscribed orgs, excluding opted-out
            user_query = (
                select(User)
                .options(selectinload(User.organization))
                .where(
                    and_(
                        User.org_id.in_(subscribed_org_ids),
                        User.is_active == True,
                    )
                )
            )

            if opted_out_user_ids:
                user_query = user_query.where(User.user_id.notin_(opted_out_user_ids))

            result = await self.db.execute(user_query)
            return list(result.scalars().all())

        return []

    # ==================== Queue Processing ====================

    async def process_queue(self, target_date: Optional[date] = None, force_all: bool = False) -> ProcessQueueResult:
        """
        Process all scheduled emails that are due.

        This is the core logic used by both:
        - Manual "Run Now" execution
        - Scheduled 2am cron job

        Args:
            target_date: Date to process for (defaults to today)
            force_all: If True, process ALL scheduled entries regardless of date

        Returns:
            ProcessQueueResult with counts and any errors
        """
        from services.report_service import ReportService, get_report_service
        from services.email_service import get_email_service

        if target_date is None:
            target_date = date.today()

        result = ProcessQueueResult()

        # Step 1: Find all scheduled entries due for processing
        if force_all:
            # Process all scheduled entries regardless of date
            query = select(ReportEmailQueue).where(
                ReportEmailQueue.status == ReportEmailQueueStatus.SCHEDULED,
            )
            logger.info(f"Processing ALL scheduled emails (force_all=True)")
        else:
            query = select(ReportEmailQueue).where(
                and_(
                    ReportEmailQueue.scheduled_for <= target_date,
                    ReportEmailQueue.status == ReportEmailQueueStatus.SCHEDULED,
                )
            )
        entries_result = await self.db.execute(query)
        entries = list(entries_result.scalars().all())

        if not entries:
            # Log more info to help debug
            count_result = await self.db.execute(
                select(func.count(ReportEmailQueue.id)).where(
                    ReportEmailQueue.status == ReportEmailQueueStatus.SCHEDULED
                )
            )
            total_scheduled = count_result.scalar() or 0
            logger.info(
                f"No scheduled emails to process for target_date={target_date}. "
                f"Total scheduled entries in DB: {total_scheduled}"
            )
            return result

        logger.info(f"Processing {len(entries)} scheduled emails for {target_date}")

        # Step 2: Mark all as ready
        for entry in entries:
            entry.status = ReportEmailQueueStatus.READY
        await self.db.commit()

        # Step 3: Process each entry
        # Get services
        email_service = get_email_service()

        # Group entries by report_id to avoid regenerating email HTML multiple times
        entries_by_report: dict[int, List[ReportEmailQueue]] = {}
        for entry in entries:
            if entry.report_id not in entries_by_report:
                entries_by_report[entry.report_id] = []
            entries_by_report[entry.report_id].append(entry)

        # Process each report's emails
        for report_id, report_entries in entries_by_report.items():
            # Generate email HTML once per report
            try:
                # Create a temporary report service with the current db session
                report_service = ReportService(self.db)

                # We need a user to generate the email - use the first entry's user
                # Note: generate_report_email_html checks access, so we need a user with access
                # For admin-triggered sends, we'll create a synthetic admin user check
                first_entry = report_entries[0]

                # Get a user who has access to this report (the recipient should have access)
                user_result = await self.db.execute(
                    select(User).where(User.user_id == first_entry.user_id)
                )
                user = user_result.scalars().first()

                if not user:
                    error_msg = f"User {first_entry.user_id} not found for report {report_id}"
                    logger.error(error_msg)
                    for entry in report_entries:
                        entry.status = ReportEmailQueueStatus.FAILED
                        entry.error_message = error_msg
                        result.failed_count += 1
                        result.errors.append(error_msg)
                    await self.db.commit()
                    continue

                # Generate email HTML
                email_result = await report_service.generate_report_email_html(user, report_id)

                if not email_result or not email_result.html:
                    error_msg = f"Failed to generate email HTML for report {report_id}"
                    logger.error(error_msg)
                    for entry in report_entries:
                        entry.status = ReportEmailQueueStatus.FAILED
                        entry.error_message = error_msg
                        result.failed_count += 1
                        result.errors.append(error_msg)
                    await self.db.commit()
                    continue

                # Send to each recipient
                for entry in report_entries:
                    result.total_processed += 1

                    # Mark as processing
                    entry.status = ReportEmailQueueStatus.PROCESSING
                    await self.db.commit()

                    try:
                        # Send the email
                        success = await email_service.send_report_email(
                            to_email=entry.email,
                            report_name=email_result.report_name,
                            html_content=email_result.html,
                            subject=email_result.subject,
                            from_name=email_result.from_name,
                            images=email_result.images,
                        )

                        if success:
                            entry.status = ReportEmailQueueStatus.SENT
                            entry.sent_at = datetime.utcnow()
                            result.sent_count += 1
                            logger.info(f"Email sent successfully to {entry.email} for report {report_id}")
                        else:
                            entry.status = ReportEmailQueueStatus.FAILED
                            entry.error_message = "Email service returned failure"
                            result.failed_count += 1
                            result.errors.append(f"Failed to send to {entry.email}")
                            logger.error(f"Email service failed for {entry.email}")

                    except Exception as e:
                        entry.status = ReportEmailQueueStatus.FAILED
                        entry.error_message = str(e)[:500]  # Truncate long errors
                        result.failed_count += 1
                        result.errors.append(f"Error sending to {entry.email}: {str(e)}")
                        logger.error(f"Exception sending email to {entry.email}: {e}", exc_info=True)

                    await self.db.commit()

            except Exception as e:
                error_msg = f"Error processing report {report_id}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                for entry in report_entries:
                    if entry.status in [ReportEmailQueueStatus.READY, ReportEmailQueueStatus.PROCESSING]:
                        entry.status = ReportEmailQueueStatus.FAILED
                        entry.error_message = str(e)[:500]
                        result.failed_count += 1
                        result.errors.append(error_msg)
                await self.db.commit()

        logger.info(
            f"Queue processing complete: {result.total_processed} processed, "
            f"{result.sent_count} sent, {result.failed_count} failed"
        )
        return result


# Dependency injection provider
async def get_report_email_queue_service(
    db: AsyncSession = Depends(get_async_db)
) -> ReportEmailQueueService:
    """Get a ReportEmailQueueService instance with async database session."""
    return ReportEmailQueueService(db)
