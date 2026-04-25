import os
import re
import httpx
from dotenv import load_dotenv

load_dotenv()

# ANDROID GATEWAY CONFIG
ANDROID_GATEWAY_URL = os.getenv("ANDROID_GATEWAY_URL", "https://api.sms-gate.app/3rdparty/v1")
ANDROID_GATEWAY_USER = os.getenv("ANDROID_GATEWAY_USER", "sms")
ANDROID_GATEWAY_PASS = os.getenv("ANDROID_GATEWAY_PASS", "password")
ANDROID_GATEWAY_DEVICE_ID = os.getenv("ANDROID_GATEWAY_DEVICE_ID")

async def send_sms(to_phone: str, message: str):
    """
    Sends an SMS message via your Android Phone Gateway (Supports Local & Cloud).
    """
    print(f"📡 [ANDROID GATEWAY] Sending to {to_phone}: {message}")
    
    try:
        async with httpx.AsyncClient() as client:
            # Construct the payload for Cloud API
            payload = {
                "phoneNumber": to_phone,
                "message": message
            }
            
            # If using Cloud Mode, we MUST include the Device ID
            if ANDROID_GATEWAY_DEVICE_ID:
                payload["deviceId"] = ANDROID_GATEWAY_DEVICE_ID
            
            auth = (ANDROID_GATEWAY_USER, ANDROID_GATEWAY_PASS)
            
            # Cloud API specifically uses /messages
            endpoint = f"{ANDROID_GATEWAY_URL}/messages"
            
            response = await client.post(endpoint, json=payload, auth=auth, timeout=15.0)
            
            if response.status_code not in [200, 201]:
                print(f"❌ [ANDROID GATEWAY] Failed. Status: {response.status_code} Response: {response.text}")
            
            return response.status_code in [200, 201]
    except Exception as e:
        print(f"Android SMS Gateway Error: {e}")
        return False

def extract_location_from_text(text: str):
    """
    Tries to extract latitude/longitude from SMS text.
    Supports: 
    - Google Maps links: google.com/maps?q=lat,lng
    - Direct coordinates: 12.345, 78.910
    """
    # Regex for Lat, Lng coordinates
    coord_pattern = r"([-+]?\d{1,2}\.\d+),\s*([-+]?\d{1,3}\.\d+)"
    match = re.search(coord_pattern, text)
    if match:
        return float(match.group(1)), float(match.group(2))
    
    # Regex for Google Maps q= parameter
    maps_pattern = r"q=([-+]?\d{1,2}\.\d+),([-+]?\d{1,3}\.\d+)"
    match = re.search(maps_pattern, text)
    if match:
        return float(match.group(1)), float(match.group(2))
    
    return None, None

def get_tactical_instructions():
    """
    Returns the standard operating procedure for ground reporters.
    """
    return (
        "📍 CommunityPulse Ground Protocol:\n\n"
        "1. SHARE LOCATION: Send a Google Maps link or Lat, Lng coordinates.\n"
        "2. REPORT NEED: Describe the emergency (Medical, Food, Water, Animal).\n"
        "3. UPDATE: Type 'STATUS' to check your mission progress.\n\n"
        "Example: 'Need medical help at 12.34, 78.91'"
    )

async def process_incoming_sms(from_phone: str, body: str):
    """
    Handles incoming SMS messages from reporters.
    Extracts location and detects if instructions are needed.
    """
    print(f"📩 [SMS BOT] Received from {from_phone}: {body}")
    
    # Check for help requests
    if body.upper().strip() in ["HELP", "GUIDE", "START", "HELLO"]:
        return {
            "phone": from_phone,
            "text": body,
            "is_instruction_request": True,
            "location_detected": False
        }

    lat, lng = extract_location_from_text(body)
    
    # Returning a dict so the main backend can log it to DB
    return {
        "phone": from_phone,
        "text": body,
        "latitude": lat,
        "longitude": lng,
        "location_detected": lat is not None
    }

async def trigger_emergency_call(to_phone: str, situation: str):
    """
    Triggers an automated AI call to a volunteer for Priority 10 emergencies.
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
