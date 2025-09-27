"""
Login Email Service

Service for sending login tokens via email.
Uses SMTP for sending emails.
"""

import smtplib
import secrets
from datetime import datetime, timedelta
from typing import Optional
import logging

from config.settings import settings

logger = logging.getLogger(__name__)


class LoginEmailService:
    """Service for sending login token emails"""
    
    def __init__(self):
        # Use SMTP settings from environment variables
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL or 'noreply@jambot.com'
        self.app_name = settings.APP_NAME
        self.frontend_url = settings.FRONTEND_URL
    
    def generate_login_token(self) -> tuple[str, datetime]:
        """
        Generate a secure login token and expiration time.
        
        Returns:
            tuple: (token, expiration_datetime)
        """
        # Generate a secure random token
        token = secrets.token_urlsafe(32)
        
        # Set expiration to 30 minutes from now
        expires_at = datetime.utcnow() + timedelta(minutes=30)
        
        return token, expires_at
    
    def _create_login_email(self, email: str, token: str) -> str:
        """
        Create the login email with token link.
        
        Args:
            email: User's email address
            token: Login token
            
        Returns:
            str: Email message text
        """
        # Create login URL
        login_url = f"{self.frontend_url}/auth/token-login?token={token}"
        
        # Create simple text email content
        email_content = f"""Subject: {self.app_name} - One-Click Login
From: {self.from_email}
To: {email}

Hello!

You requested a one-click login for {self.app_name}.

Click the link below to log in (expires in 30 minutes):
{login_url}

If you didn't request this login, you can safely ignore this email.

Best regards,
The {self.app_name} Team
"""
        
        return email_content
    
    async def send_login_token(self, email: str, token: str) -> bool:
        """
        Send login token email to user.
        
        Args:
            email: User's email address
            token: Login token
            
        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # For development, just log the token instead of sending email
            if not self.smtp_username or not self.smtp_password:
                logger.info(f"DEV MODE: Login token for {email}: {token}")
                logger.info(f"DEV MODE: Login URL: {self.frontend_url}/auth/token-login?token={token}")
                return True
            
            # Create email message
            email_content = self._create_login_email(email, token)
            
            # Send email via SMTP
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.sendmail(self.from_email, email, email_content)
                
            logger.info(f"Login token email sent successfully to {email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send login token email to {email}: {str(e)}")
            if "Application-specific password required" in str(e):
                logger.error("Gmail requires an App Password, not your regular password!")
                logger.error("To fix: Go to Google Account → Security → 2-Step Verification → App passwords")
                logger.error("Generate a 16-character app password and use that in SMTP_PASSWORD")
            return False
    
    async def send_test_email(self) -> bool:
        """
        Send a simple test email to cliff.rosen@gmail.com
        
        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            test_email = "cliff.rosen@gmail.com"
            logger.info(f"Attempting to send REAL test email to {test_email}")
            
            # Check if we have proper SMTP credentials
            if not self.smtp_username or not self.smtp_password or not self.from_email:
                logger.error("Missing SMTP credentials. Please set environment variables:")
                logger.error("- SMTP_USERNAME: Your email address")
                logger.error("- SMTP_PASSWORD: Your email app password") 
                logger.error("- FROM_EMAIL: Your email address")
                return False
            
            logger.info(f"Using SMTP server: {self.smtp_server}:{self.smtp_port}")
            logger.info(f"From email: {self.from_email}")
            
            # Create simple test email
            email_content = f"""Subject: Test Email from {self.app_name}
From: {self.from_email}
To: {test_email}

This is a REAL test email from the {self.app_name} login service.

The email system is working correctly and actually sending emails!

SMTP Settings used:
- Server: {self.smtp_server}
- Port: {self.smtp_port}
- Username: {self.smtp_username}

Best regards,
The {self.app_name} Team
"""
            
            # Send email via SMTP
            logger.info("Connecting to SMTP server...")
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                logger.info("Starting TLS...")
                server.starttls()
                logger.info("Logging in to SMTP server...")
                server.login(self.smtp_username, self.smtp_password)
                logger.info("Sending email...")
                server.sendmail(self.from_email, test_email, email_content)
                
            logger.info(f"REAL test email sent successfully to {test_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send REAL test email: {str(e)}")
            if "Application-specific password required" in str(e):
                logger.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                logger.error("Gmail requires an App Password, NOT your regular password!")
                logger.error("To fix this:")
                logger.error("1. Go to https://myaccount.google.com/security")
                logger.error("2. Enable 2-Step Verification if not already enabled")
                logger.error("3. Go to 'App passwords' section")
                logger.error("4. Generate a new app password (16 characters)")
                logger.error("5. Set SMTP_PASSWORD to that app password in your .env file")
                logger.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            else:
                logger.error("Make sure your environment variables are set correctly:")
                logger.error("- SMTP_USERNAME: Your Gmail address")
                logger.error("- SMTP_PASSWORD: Your Gmail App Password (not regular password)")
                logger.error("- FROM_EMAIL: Your Gmail address")
            return False