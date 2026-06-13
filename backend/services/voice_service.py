import os
import httpx
from dotenv import load_dotenv

load_dotenv()

def sanitize_to_e164(phone: str) -> str:
    """Sanitizes phone numbers to standard E.164 format, default to +91 (IST/India)."""
    cleaned = "".join(c for c in phone if c.isdigit() or c == '+')
    if not cleaned:
        return phone
    if not cleaned.startswith('+'):
        if cleaned.startswith('0') and len(cleaned) > 1:
            cleaned = cleaned[1:]
        if len(cleaned) == 10:
            cleaned = "+91" + cleaned
        elif len(cleaned) == 12 and cleaned.startswith("91"):
            cleaned = "+" + cleaned
        else:
            cleaned = "+" + cleaned
    return cleaned

async def trigger_emergency_call(to_phone: str, situation: str):
    """
    Triggers an automated AI call to a volunteer (AVEK-1) for Priority 10 emergencies.
    Uses the Vapi Outbound API.
    """
    to_phone = sanitize_to_e164(to_phone)
    print(f"[VOICE ALERT] Triggering emergency call to {to_phone} for: {situation}")
    
    try:
        async with httpx.AsyncClient() as client:
            headers = {"Authorization": f"Bearer {os.getenv('VAPI_API_KEY')}"}
            payload = {
                "phoneNumberId": os.getenv("VAPI_PHONE_NUMBER_ID"),
                "assistantId": os.getenv("VAPI_ASSISTANT_ID"),
                "customer": {"number": to_phone},
                "assistantOverrides": {
                    "variableValues": {
                        "situation": situation
                    }
                }
            }
            # Vapi Outbound API
            response = await client.post("https://api.vapi.ai/call/phone", json=payload, headers=headers)
            if response.status_code != 201:
                print(f"[VAPI ERROR] Status: {response.status_code}, Response: {response.text}")
            return response.status_code == 201
    except Exception as e:
        print(f"Failed to trigger emergency call: {e}")
        return False
