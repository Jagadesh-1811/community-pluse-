import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

def send_credentials_email(recipient_email: str, password: str, domain: str, categories: list) -> bool:
    """
    Sends a volunteer credential dispatch email using Gmail SMTP.
    """
    sender_email = os.getenv("GMAIL_SENDER_EMAIL")
    sender_password = os.getenv("GMAIL_APP_PASSWORD")

    if not sender_email or not sender_password:
        logger.error("GMAIL_SENDER_EMAIL or GMAIL_APP_PASSWORD env vars are not set. SMTP aborted.")
        return False

    try:
        # Create message container
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "🚨 COMMUNITYPULSE: Tactical Clearance Commissioned"
        msg["From"] = f"CommunityPulse Admin <{sender_email}>"
        msg["To"] = recipient_email

        # HTML Body
        categories_str = ", ".join(categories) if categories else "General Response"
        html = f"""
        <html>
        <body style="font-family: 'Courier New', monospace; background-color: #0b0f19; color: #f3f4f6; padding: 40px; margin: 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #111827; border: 4px solid #facc15; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3);">
                <div style="background-color: #facc15; padding: 20px; text-align: center;">
                    <h1 style="color: #111827; margin: 0; font-family: 'Impact', sans-serif; letter-spacing: 2px; text-transform: uppercase;">TACTICAL COMMISSION</h1>
                </div>
                <div style="padding: 40px;">
                    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                        Attention Agent,<br><br>
                        Your operational credentials for the <strong>CommunityPulse</strong> emergency response network have been generated.
                    </p>
                    
                    <div style="background-color: #0b0f19; border: 1px solid #374151; padding: 24px; border-radius: 12px; margin-bottom: 30px;">
                        <table style="width: 100%; font-size: 14px; color: #f3f4f6;">
                            <tr>
                                <td style="padding: 8px 0; color: #9ca3af; font-weight: bold; width: 40%;">GATEWAY ID:</td>
                                <td style="padding: 8px 0; font-weight: bold;">{recipient_email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #9ca3af; font-weight: bold;">ACCESS TOKEN:</td>
                                <td style="padding: 8px 0; font-family: monospace; font-weight: bold; color: #facc15; letter-spacing: 1px;">{password}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #9ca3af; font-weight: bold;">CLEARANCE LEVEL:</td>
                                <td style="padding: 8px 0; font-weight: bold; color: #facc15;">VOLUNTEER</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #9ca3af; font-weight: bold;">SECTOR DOMAIN:</td>
                                <td style="padding: 8px 0; font-weight: bold; text-transform: uppercase;">{domain} Health</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #9ca3af; font-weight: bold;">ASSIGNED SECTORS:</td>
                                <td style="padding: 8px 0; font-weight: bold;">{categories_str}</td>
                            </tr>
                        </table>
                    </div>

                    <p style="font-size: 14px; color: #9ca3af; line-height: 1.6; margin-bottom: 30px;">
                        To begin operations, log in to the gateway using your new credentials and activate your live telemetry.
                    </p>

                    <div style="text-align: center;">
                        <a href="http://localhost:3000/login" style="background-color: #facc15; color: #111827; text-decoration: none; padding: 16px 32px; font-weight: 900; border-radius: 8px; font-family: sans-serif; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">
                            Log In to Command
                        </a>
                    </div>
                </div>
                <div style="background-color: #1f2937; padding: 15px; text-align: center; border-t: 1px solid #374151; font-size: 10px; color: #9ca3af;">
                    SECURE TRANSMISSION • COMMUNITYPULSE COORDINATION NODE
                </div>
            </div>
        </body>
        </html>
        """
        
        msg.attach(MIMEText(html, "html"))

        # Send via Gmail SMTP
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, recipient_email, msg.as_string())
        
        logger.info(f"Credentials email dispatched successfully to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send credentials email to {recipient_email}: {e}")
        return False
