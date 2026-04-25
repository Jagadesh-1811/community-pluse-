import httpx
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

# Load from .env
GATEWAY_URL = os.getenv("ANDROID_GATEWAY_URL", "https://api.sms-gate.app/3rdparty/v1")
PHONE_USER = os.getenv("ANDROID_GATEWAY_USER")
PHONE_PASS = os.getenv("ANDROID_GATEWAY_PASS")
DEVICE_ID = os.getenv("ANDROID_GATEWAY_DEVICE_ID")
COMPUTER_IP = os.getenv("MY_COMPUTER_IP")

async def register():
    # If COMPUTER_IP starts with 192.168, warn the user
    if COMPUTER_IP.startswith("192.168") or COMPUTER_IP.startswith("172."):
        print("⚠️ WARNING: You are using a LOCAL IP with a CLOUD server.")
        print("The Cloud Server CANNOT reach your computer. Please use an Ngrok URL.")
        print("-" * 30)

    url = f"{GATEWAY_URL}/webhooks"
    
    # Ensure the callback URL is clean
    callback_url = COMPUTER_IP
    if not callback_url.startswith("http"):
        callback_url = f"http://{callback_url}"
    
    # Append the endpoint if not present
    if not callback_url.endswith("/sms/incoming"):
        callback_url = f"{callback_url.rstrip('/')}/sms/incoming"

    payload = {
        "url": callback_url,
        "event": "sms:received"
    }
    
    # Cloud mode needs Device ID
    if DEVICE_ID:
        payload["deviceId"] = DEVICE_ID
    
    print(f"🔗 Registering webhook at {url}...")
    print(f"📡 Callback URL set to: {callback_url}")
    
    try:
        async with httpx.AsyncClient() as client:
            auth = (PHONE_USER, PHONE_PASS)
            response = await client.post(url, json=payload, auth=auth, timeout=15.0)
            
            if response.status_code in [200, 201]:
                print("✅ SUCCESS! Cloud Webhook registered.")
                print(f"Response: {response.json()}")
            else:
                print(f"❌ FAILED. Status: {response.status_code}")
                print(f"Response: {response.text}")
    except Exception as e:
        print(f"❌ ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(register())
