"""
Schedule calculation utilities.

Pure functions for computing next run times and send times from schedule config.
Used by both the worker (dispatcher) and the main API (operations service, email queue).
"""

from datetime import datetime, date, timedelta

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo


# Day name -> weekday number (Monday=0 .. Sunday=6)
DAY_NAME_TO_NUM = {
    'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
    'friday': 4, 'saturday': 5, 'sunday': 6,
}

# Frequency -> lookback days (used for date-range calculation)
FREQUENCY_LOOKBACK = {
    'daily': 1,
    'weekly': 7,
    'biweekly': 14,
    'monthly': 30,
}


def calculate_next_run(schedule_config: dict) -> datetime:
    """
    Calculate the next scheduled run time based on config.

    For weekly/biweekly: finds the next occurrence of anchor_day at preferred_time.
    For daily: tomorrow at preferred_time.
    For monthly: next run_day_of_month at preferred_time.

    All calculations respect the configured timezone, then convert to naive UTC
    for storage (since next_scheduled_run is compared in UTC).
    """
    frequency = schedule_config.get('frequency') or 'weekly'
    tz_name = schedule_config.get('timezone') or 'UTC'
    tz = ZoneInfo(tz_name)

    run_time_str = schedule_config.get('preferred_time') or '03:00'
    hour, minute = (int(x) for x in run_time_str.split(':'))

    now_local = datetime.now(tz)

    if frequency == 'daily':
        candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=1)
        return candidate.astimezone(ZoneInfo('UTC')).replace(tzinfo=None)

    elif frequency in ('weekly', 'biweekly'):
        run_day_name = schedule_config.get('anchor_day') or 'monday'
        target_weekday = DAY_NAME_TO_NUM.get(run_day_name.lower(), 0)
        current_weekday = now_local.weekday()

        days_ahead = (target_weekday - current_weekday) % 7
        if days_ahead == 0:
            days_ahead = 7  # Same day — schedule for next week (we just ran today)

        if frequency == 'biweekly':
            days_ahead += 7

        candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days_ahead)
        return candidate.astimezone(ZoneInfo('UTC')).replace(tzinfo=None)

    elif frequency == 'monthly':
        run_day_of_month = schedule_config.get('run_day_of_month', 1)
        if now_local.month == 12:
            candidate = now_local.replace(year=now_local.year + 1, month=1, day=run_day_of_month,
                                          hour=hour, minute=minute, second=0, microsecond=0)
        else:
            candidate = now_local.replace(month=now_local.month + 1, day=run_day_of_month,
                                          hour=hour, minute=minute, second=0, microsecond=0)
        return candidate.astimezone(ZoneInfo('UTC')).replace(tzinfo=None)

    else:
        return datetime.utcnow() + timedelta(weeks=1)


def calculate_send_datetime(schedule_config: dict, reference_date: date) -> datetime:
    """
    Calculate the send datetime for a report based on schedule config.

    For weekly/biweekly: the next occurrence of send_day at send_time on or after reference_date.
    For daily: reference_date at send_time (or next day if send_time <= run_time).
    For monthly: send_day_of_month at send_time.

    Returns a naive UTC datetime.
    """
    tz_name = schedule_config.get('timezone') or 'UTC'
    tz = ZoneInfo(tz_name)
    frequency = schedule_config.get('frequency') or 'weekly'

    send_time_str = schedule_config.get('send_time') or '08:00'
    s_hour, s_minute = (int(x) for x in send_time_str.split(':'))

    if frequency in ('weekly', 'biweekly'):
        send_day_name = schedule_config.get('send_day') or schedule_config.get('anchor_day') or 'monday'
        target_weekday = DAY_NAME_TO_NUM.get(send_day_name.lower(), 0)
        ref_weekday = reference_date.weekday()

        days_ahead = (target_weekday - ref_weekday) % 7
        if days_ahead == 0:
            run_time_str = schedule_config.get('preferred_time') or '03:00'
            r_hour, r_minute = (int(x) for x in run_time_str.split(':'))
            if (s_hour, s_minute) <= (r_hour, r_minute):
                days_ahead = 7

        send_date = reference_date + timedelta(days=days_ahead)

    elif frequency == 'daily':
        run_time_str = schedule_config.get('preferred_time') or '03:00'
        r_hour, r_minute = (int(x) for x in run_time_str.split(':'))
        if (s_hour, s_minute) <= (r_hour, r_minute):
            send_date = reference_date + timedelta(days=1)
        else:
            send_date = reference_date

    elif frequency == 'monthly':
        send_day_of_month = schedule_config.get('send_day_of_month',
                                                 schedule_config.get('run_day_of_month', 1))
        if send_day_of_month >= reference_date.day:
            send_date = reference_date.replace(day=send_day_of_month)
        else:
            if reference_date.month == 12:
                send_date = reference_date.replace(year=reference_date.year + 1, month=1, day=send_day_of_month)
            else:
                send_date = reference_date.replace(month=reference_date.month + 1, day=send_day_of_month)
    else:
        send_date = reference_date

    local_dt = datetime(send_date.year, send_date.month, send_date.day,
                        s_hour, s_minute, 0, tzinfo=tz)
    return local_dt.astimezone(ZoneInfo('UTC')).replace(tzinfo=None)
