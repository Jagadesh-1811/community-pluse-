from database import get_db
from firebase_admin import db as admin_db

root_ref = get_db()

async def log_message(need_id: str, message_type: str, body: str, status: str = "sent"):
    """Logs a communication event to the messages collection."""
    try:
        messages_ref = root_ref.child("messages")
        message_record = {
            "need_id": need_id,
            "type": message_type,
            "body": body,
            "status": status,
            "created_at": admin_db.ServerValue.TIMESTAMP
        }
        messages_ref.push(message_record)
    except Exception as e:
        print(f"Error logging message: {e}")

async def send_dispatch_notification(need_id: str):
    """
    Fetches the need record and logs the dispatch event.
    """
    try:
        # 1. Get the need details
        need_ref = root_ref.child("needs").child(need_id)
        need = need_ref.get()
        
        if not need:
            print(f"Need #{need_id} not found for notification.")
            return False

        location = need.get("location_name", "Unknown Location")
        
        # 2. Prepare message
        body = f"URGENT ALERT: A volunteer has been DISPATCHED to your location ({location}). Help is on the way."
        
        # 3. Log the message to the DB for the "Comms" tab
        await log_message(
            need_id=need_id,
            message_type="DISPATCH_ALERT",
            body=body,
            status="logged"
        )
        
        return True
    except Exception as e:
        print(f"Error in send_dispatch_notification: {e}")
        return False
