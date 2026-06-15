import pytest
from main import handle_vapi_webhook
from fastapi import BackgroundTasks

@pytest.mark.asyncio
async def test_handle_vapi_webhook_direct():
    payload = {
        "message": {
            "type": "end-of-call-report",
            "transcript": "We need urgent medical help here at Block A near the central market. There is a fire and someone is unconscious.",
            "recordingUrl": "https://api.vapi.ai/recordings/test.mp3",
            "customer": {"number": "+1234567890"},
            "call": {"id": "123-call", "type": "phoneCall"}
        }
    }
    bg_tasks = BackgroundTasks()
    res = await handle_vapi_webhook(payload, bg_tasks)
    assert res.get("status") == "success"
    assert "id" in res
