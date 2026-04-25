import os
import httpx
from dotenv import load_dotenv

load_dotenv()

async def trigger_emergency_call(to_phone: str, situation: str):
    """
    Triggers an automated AI call to a volunteer (AVEK-1) for Priority 10 emergencies.
    Uses the Vapi Outbound API.
    """
    print(f"🚨 [VOICE ALERT] Triggering emergency call to {to_phone} for: {situation}")
    
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
            return response.status_code == 201
    except Exception as e:
        print(f"Failed to trigger emergency call: {e}")
        return False
