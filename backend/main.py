import os
from fastapi import FastAPI, HTTPException, BackgroundTasks, Form
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uuid
import datetime
from database import get_db
from firebase_admin import db as admin_db
from services.ai_service import extract_need_structure, score_urgency, generate_tactical_reply
from services.telegram_service import run_bot, send_telegram_message
from services.voice_service import trigger_emergency_call
import asyncio

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CommunityPulse API")

@app.on_event("startup")
async def startup_event():
    """
    Background tasks on startup.
    """
    print("🚀 CommunityPulse Intelligence Engine is starting...")
    # Start Telegram bot for incoming reports
    try:
        asyncio.create_task(run_bot())
        print(" Telegram Bot: ACTIVE")
    except Exception as e:
        print(f" Telegram Bot Error: {e}")


# Add CORS middleware to allow communication with the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex="http://localhost:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

root_ref = get_db()

class IntakeRequest(BaseModel):
    text: str
    source: str = "web"
    phone: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    domain: Optional[str] = "human"

@app.get("/")
async def root():
    return {"message": "CommunityPulse API is running"}

@app.post("/intake")
async def process_intake(request: IntakeRequest, background_tasks: BackgroundTasks):
    """
    Primary intake for Web and WhatsApp reports.
    Uses AI to analyze and score incoming needs.
    """
    if not request.text:
        raise HTTPException(status_code=400, detail="Text is required")

    # 1. AI Analysis
    ai_data = await extract_need_structure(request.text)
    scoring_data = await score_urgency(request.text)
    
    need_type = ai_data.get("need_type")
    if request.domain == "animal":
        need_type = "animal"
    
    # 2. Record Generation
    need_id = str(uuid.uuid4())
    need_record = {
        "id": need_id,
        "raw_text": request.text,
        "need_type": need_type,
        "domain": request.domain,
        "location_name": ai_data.get("location_name"),
        "lat": request.lat,
        "lng": request.lng,
        "urgency_score": scoring_data.get("urgency_score", 5),
        "emotional_signal": scoring_data.get("emotional_signal"),
        "status": "open",
        "source": request.source,
        "phone": request.phone,
        "created_at": {".sv": "timestamp"}
    }
    
    # 3. Save to Firebase
    try:
        admin_db.reference(f"needs/{need_id}").set(need_record)
        
        # 4. Critical Alert: Call Volunteer if Priority is 10
        if scoring_data.get("urgency_score", 0) >= 10:
            volunteer_phone = os.getenv("VOLUNTEER_ALERT_PHONE")
            if volunteer_phone:
                background_tasks.add_task(trigger_emergency_call, volunteer_phone, request.text)
                
        return {"status": "success", "id": need_id}
    except Exception as e:
        print(f"Database error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/notify/vapi")
async def handle_vapi_webhook(background_tasks: BackgroundTasks, request: dict):
    """
    Receives call data from the Vapi Voice Agent.
    """
    # Look for "message" wrapper if present
    payload = request.get("message", request)
    if payload.get("type") != "end-of-call-report":
        return {"status": "ignored"}

    transcript = payload.get("transcript", "")
    recording_url = payload.get("recordingUrl")
    
    # AI Analysis
    ai_data = await extract_need_structure(transcript)
    scoring_data = await score_urgency(transcript)
    
    need_id = str(uuid.uuid4())
    need_record = {
        "id": need_id,
        "description": transcript,
        "status": "open",
        "source": "voice_agent",
        "recording_url": recording_url,
        "urgency_score": scoring_data.get("urgency_score", 5),
        "life_threat": scoring_data.get("life_threat", False),
        "created_at": {".sv": "timestamp"}
    }
    
    admin_db.reference(f"needs/{need_id}").set(need_record)

    # Critical Alert: Call Volunteer if Priority is 10
    if scoring_data.get("urgency_score", 0) >= 10:
        volunteer_phone = os.getenv("VOLUNTEER_ALERT_PHONE")
        if volunteer_phone:
            background_tasks.add_task(trigger_emergency_call, volunteer_phone, transcript)
    
    return {"status": "success", "id": need_id}

@app.post("/status/update")
async def update_status(request: dict, background_tasks: BackgroundTasks):
    """
    Update mission status and notify reporter.
    """
    need_id = request.get("need_id")
    status = request.get("status")
    
    need_ref = admin_db.reference(f"needs/{need_id}")
    need_ref.update({"status": status})
    
    # Notify via Telegram if applicable
    snapshot = need_ref.get()
    if snapshot and snapshot.get("source") == "telegram":
        chat_id = snapshot.get("telegram_chat_id")
        if chat_id:
            msg = f"ℹ**STATUS UPDATE**: Your request is now {status}."
            background_tasks.add_task(send_telegram_message, chat_id, msg)
            
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
