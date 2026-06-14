import sys
import os
import asyncio
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)
from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, '.env'))

from main import handle_vapi_webhook, VapiWebhookPayload
from fastapi import BackgroundTasks

async def test():
    print("Testing handle_vapi_webhook...")
    payload = VapiWebhookPayload(
        message={
            "type": "end-of-call-report",
            "transcript": "We need urgent medical help here at Block A near the central market. There is a fire and someone is unconscious.",
            "recordingUrl": "https://api.vapi.ai/recordings/test.mp3",
            "customer": {"number": "+1234567890"},
            "call": {"id": "123-call"}
        }
    )
    
    bg_tasks = BackgroundTasks()
    payload_dict = payload.model_dump() if hasattr(payload, 'model_dump') else payload.dict()
    res = await handle_vapi_webhook(payload_dict, bg_tasks)
    print("Result:", res)

if __name__ == "__main__":
    asyncio.run(test())
