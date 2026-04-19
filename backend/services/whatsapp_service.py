import os
import httpx
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")

async def send_whatsapp_confirmation(to_phone: str, need_id: str, need_type: str, location: str):
    """Sends a confirmation message via Meta WhatsApp Cloud API."""
    if not TOKEN or not PHONE_NUMBER_ID:
        print("WhatsApp credentials missing. Skipping message.")
        return

    url = f"https://graph.facebook.com/v17.0/{PHONE_NUMBER_ID}/messages"
    headers = {{
        "Authorization": f"Bearer {{TOKEN}}",
        "Content-Type": "application/json"
    }}
    
    # Using a simple text message. For production, you'd usually use Template messages.
    # Note: Text messages only work if the user contacted you in the last 24h.
    payload = {{
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {{
            "body": f"Need logged. ID: #{{need_id}}\nType: {{need_type.capitalize()}}\nLocation: {{location}}\n\nOur team is reviewing the situation. Thank you for your report."
        }}
    }}

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error sending WhatsApp: {{e}}")
            return None
