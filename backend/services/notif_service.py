from database import get_db
from services.whatsapp_service import send_whatsapp_confirmation
import datetime

db = get_db()

async def log_message(need_id: str, message_type: str, body: str, status: str = "sent"):
    """Logs a communication event to the messages table."""
    try:
        message_record = {
            "need_id": need_id,
            "type": message_type,
            "body": body,
            "status": status,
            "created_at": datetime.datetime.utcnow().isoformat()
        }
        db.table("messages").insert(message_record).execute()
    except Exception as e:
        print(f"Error logging message: {e}")

async def send_dispatch_notification(need_id: str):
    """
    Fetches the need record, sends a WhatsApp alert to the reporter,
    and logs the event.
    """
    try:
        # 1. Get the need details
        response = db.table("needs").select("*").eq("id", need_id).single().execute()
        need = response.data
        
        if not need:
            print(f"Need #{need_id} not found for notification.")
            return False

        phone = need.get("phone")
        location = need.get("location_name", "Unknown Location")
        
        # 2. Prepare message
        body = f"URGENT ALERT: A volunteer has been DISPATCHED to your location ({location}). Help is on the way. Please stay where you are if safe."
        
        # 3. Send WhatsApp if phone exists
        whatsapp_status = "skipped (no phone)"
        if phone:
            result = await send_whatsapp_confirmation(
                to_phone=phone,
                need_id=need_id,
                need_type="dispatch_alert",
                location=location
            )
            whatsapp_status = "sent" if result else "failed"

        # 4. Log the message to the DB for the "Comms" tab
        await log_message(
            need_id=need_id,
            message_type="DISPATCH_ALERT",
            body=body,
            status=whatsapp_status
        )
        
        return True
    except Exception as e:
        print(f"Error in send_dispatch_notification: {e}")
        return False
