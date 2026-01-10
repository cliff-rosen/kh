"""
Email Service

Centralized service for sending all emails.
All email sending in the application should go through this service.

Features:
- HTML emails (reports)
- Plain text emails (login tokens, password reset)
- Dev mode logging when SMTP not configured
"""

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional

from config.settings import settings

logger = logging.getLogger(__name__)


# Singleton instance for easy access
_email_service_instance: Optional['EmailService'] = None


def get_email_service() -> 'EmailService':
    """Get the singleton EmailService instance"""
    global _email_service_instance
    if _email_service_instance is None:
        _email_service_instance = EmailService()
    return _email_service_instance


class EmailService:
    """General email sending service"""

    def __init__(self):
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL or 'noreply@knowledgehorizon.com'
        self.app_name = settings.APP_NAME

    async def send_text_email(
        self,
        to_email: str,
        subject: str,
        body: str
    ) -> bool:
        """
        Send a plain text email.

        Args:
            to_email: Recipient email address
            subject: Email subject
            body: Plain text body content

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # For development, log instead of sending
            if not self.smtp_username or not self.smtp_password:
                logger.info(f"DEV MODE: Would send email to {to_email}")
                logger.info(f"DEV MODE: Subject: {subject}")
                logger.info(f"DEV MODE: Body:\n{body}")
                return True

            # Create message
            msg = MIMEText(body, 'plain')
            msg['Subject'] = subject
            msg['From'] = self.from_email
            msg['To'] = to_email

            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.sendmail(self.from_email, [to_email], msg.as_string())

            logger.info(f"Text email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            self._log_smtp_error(e)
            return False

    async def send_html_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> bool:
        """
        Send an HTML email.

        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML body content
            text_content: Plain text fallback (optional, will be auto-generated if not provided)
            cc: List of CC recipients
            bcc: List of BCC recipients

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # For development, log instead of sending
            if not self.smtp_username or not self.smtp_password:
                logger.info(f"DEV MODE: Would send email to {to_email}")
                logger.info(f"DEV MODE: Subject: {subject}")
                logger.info(f"DEV MODE: HTML content length: {len(html_content)} chars")
                return True

            # Create multipart message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = self.from_email
            msg['To'] = to_email

            if cc:
                msg['Cc'] = ', '.join(cc)
            if bcc:
                msg['Bcc'] = ', '.join(bcc)

            # Add plain text version (fallback)
            if not text_content:
                text_content = self._html_to_text(html_content)
            part1 = MIMEText(text_content, 'plain')
            msg.attach(part1)

            # Add HTML version
            part2 = MIMEText(html_content, 'html')
            msg.attach(part2)

            # Build recipient list
            recipients = [to_email]
            if cc:
                recipients.extend(cc)
            if bcc:
                recipients.extend(bcc)

            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.sendmail(self.from_email, recipients, msg.as_string())

            logger.info(f"HTML email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            self._log_smtp_error(e)
            return False

    async def send_report_email(
        self,
        to_email: str,
        report_name: str,
        html_content: str,
        cc: Optional[List[str]] = None
    ) -> bool:
        """
        Send a report email.

        Args:
            to_email: Recipient email address
            report_name: Name of the report (used in subject)
            html_content: HTML report content
            cc: List of CC recipients

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        subject = f"{self.app_name} Report: {report_name}"
        return await self.send_html_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            cc=cc
        )

    async def send_bulk_report_emails(
        self,
        recipients: List[str],
        report_name: str,
        html_content: str
    ) -> dict:
        """
        Send a report to multiple recipients.

        Args:
            recipients: List of recipient email addresses
            report_name: Name of the report
            html_content: HTML report content

        Returns:
            dict: {'success': [emails], 'failed': [emails]}
        """
        results = {'success': [], 'failed': []}

        for email in recipients:
            success = await self.send_report_email(
                to_email=email,
                report_name=report_name,
                html_content=html_content
            )
            if success:
                results['success'].append(email)
            else:
                results['failed'].append(email)

        return results

    def _html_to_text(self, html: str) -> str:
        """
        Convert HTML to plain text (basic conversion for email fallback).
        """
        import re

        # Remove style and script tags and their content
        text = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL)

        # Replace common elements
        text = re.sub(r'<br\s*/?>', '\n', text)
        text = re.sub(r'</p>', '\n\n', text)
        text = re.sub(r'</div>', '\n', text)
        text = re.sub(r'</h[1-6]>', '\n\n', text)
        text = re.sub(r'</li>', '\n', text)

        # Remove all remaining HTML tags
        text = re.sub(r'<[^>]+>', '', text)

        # Decode HTML entities
        text = text.replace('&amp;', '&')
        text = text.replace('&lt;', '<')
        text = text.replace('&gt;', '>')
        text = text.replace('&nbsp;', ' ')
        text = text.replace('&bull;', '*')

        # Clean up whitespace
        text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
        text = text.strip()

        return text

    def _log_smtp_error(self, e: Exception) -> None:
        """Log helpful SMTP error messages"""
        if "Application-specific password required" in str(e):
            logger.error("Gmail requires an App Password, not your regular password!")
            logger.error("To fix: Go to Google Account → Security → 2-Step Verification → App passwords")
            logger.error("Generate a 16-character app password and use that in SMTP_PASSWORD")
