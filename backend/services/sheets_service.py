import os
import logging
import datetime
import gspread
from google.oauth2.service_account import Credentials
from database import cred_path

logger = logging.getLogger(__name__)

# Scopes needed for sheets and drive
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

gc = None
sh = None
worksheet = None

def get_sheets_client():
    global gc
    if gc is not None:
        return gc
    
    try:
        if cred_path and os.path.exists(str(cred_path)):
            credentials = Credentials.from_service_account_file(str(cred_path), scopes=SCOPES)
            gc = gspread.authorize(credentials)
            logger.info(" Google Sheets API client initialized successfully.")
            return gc
        else:
            logger.error(" Credential file not found for Google Sheets initialization.")
            return None
    except Exception as e:
        logger.error(f" Failed to initialize Google Sheets client: {e}")
        return None

def init_sheet():
    global sh, worksheet
    client = get_sheets_client()
    if not client:
        return None
    
    sheet_id = os.getenv("GOOGLE_SHEET_ID")
    if not sheet_id:
        logger.warning(
            " GOOGLE_SHEET_ID not found in environment. "
            "To enable Sheets logging: create a Google Sheet, share it with the service account "
            f"({client.auth.signer_email if hasattr(client.auth, 'signer_email') else 'your Firebase service account email'}), "
            "and set GOOGLE_SHEET_ID in your backend .env file."
        )
        return None

    try:
        sh = client.open_by_key(sheet_id)
        # Try to get the first sheet, or create one named "Incident Logs"
        try:
            worksheet = sh.worksheet("Incident Logs")
        except gspread.exceptions.WorksheetNotFound:
            worksheet = sh.add_worksheet(title="Incident Logs", rows="1000", cols="13")
            # Create headers
            headers = [
                "Timestamp", 
                "Incident ID", 
                "Report Text", 
                "Urgency Score", 
                "Domain", 
                "Need Type", 
                "Dispatch Status", 
                "Location Name", 
                "Latitude", 
                "Longitude", 
                "Source", 
                "Reporter Info", 
                "Action Notes"
            ]
            worksheet.append_row(headers)
        logger.info(f" Connected to Google Sheet: {sh.title}")
        return worksheet
    except Exception as e:
        logger.error(f" Failed to open Google Sheet with ID '{sheet_id}': {e}. Please ensure the sheet is shared with the service account email.")
        return None

def export_incident_to_sheet(need_id: str, need_data: dict):
    """
    Appends a row to the Google Sheets dashboard representing the current incident state change.
    """
    try:
        # Lazy initialize
        ws = worksheet
        if ws is None:
            ws = init_sheet()
        
        if ws is None:
            # Sheet integration not configured or errored
            return False

        # Gather fields
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        raw_text = need_data.get("raw_text") or need_data.get("description") or ""
        urgency = need_data.get("urgency_score", "")
        domain = need_data.get("domain", "")
        need_type = need_data.get("need_type", "")
        status = need_data.get("status", "")
        loc_name = need_data.get("location_name", "")
        lat = need_data.get("lat") or need_data.get("latitude") or ""
        lng = need_data.get("lng") or need_data.get("longitude") or ""
        source = need_data.get("source", "")
        
        # Combine reporter info
        reporter_parts = []
        if need_data.get("reporter_name"):
            reporter_parts.append(f"Name: {need_data.get('reporter_name')}")
        if need_data.get("reporter_email"):
            reporter_parts.append(f"Email: {need_data.get('reporter_email')}")
        if need_data.get("phone"):
            reporter_parts.append(f"Phone: {need_data.get('phone')}")
        if need_data.get("caller_phone"):
            reporter_parts.append(f"Caller Phone: {need_data.get('caller_phone')}")
        reporter_info = " | ".join(reporter_parts) or "Unknown"
        
        notes = need_data.get("notes") or ""

        row = [
            timestamp,
            need_id,
            raw_text,
            urgency,
            domain,
            need_type,
            status,
            loc_name,
            lat,
            lng,
            source,
            reporter_info,
            notes
        ]
        
        ws.append_row(row)
        logger.info(f" Exported incident log change to sheet for need {need_id}")
        return True
    except Exception as e:
        logger.error(f" Error appending row to Google Sheets: {e}")
        return False
