import os
from env import load_backend_env

# Load environment variables FIRST, before any other imports
load_backend_env()

from fastapi import FastAPI, HTTPException, BackgroundTasks, Form
from pydantic import BaseModel
from typing import Optional, Dict, Any, Literal
import uuid
import datetime
from database import get_db
from firebase_admin import db as admin_db
from services.ai_service import extract_need_structure, score_urgency, generate_tactical_reply
from services.telegram_service import run_bot, send_telegram_message
from services.voice_service import trigger_emergency_call
import asyncio
import logging

from fastapi.middleware.cors import CORSMiddleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CommunityPulse API",
    description="Real-time crisis coordination and field reporting platform",
    version="1.0.0"
)

@app.on_event("startup")
async def startup_event():
    """
    Background tasks on startup.
    """
    environment = os.getenv("ENVIRONMENT", "development")
    logger.info(f"[STARTUP] CommunityPulse Intelligence Engine v1.0.0 starting in {environment} mode...")
    
    # Verify Firebase connection
    try:
        test_ref = root_ref
        if test_ref is None:
            logger.warning("⚠️  Firebase reference is None - database operations may fail")
        else:
            logger.info("✅ Firebase database connection verified")
    except Exception as e:
        logger.error(f"❌ Firebase verification failed: {e}")
    
    # Telegram bot disabled for hackathon testing to avoid conflicts
    logger.info("[BOT] Telegram Bot: DISABLED (for deployment testing)")
    # Uncomment below for production with Telegram support
    # try:
    #     asyncio.create_task(run_bot())
    #     logger.info("[BOT] Telegram Bot: ACTIVE")
    # except Exception as e:
    #     logger.error(f"[BOT ERROR] Telegram Bot Error: {e}")


# Configure CORS based on environment
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
if "production" in os.getenv("ENVIRONMENT", "development"):
    # Production: Restrict to specific domain
    CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS if origin.strip()]
else:
    # Development: Allow localhost
    CORS_ORIGINS = ["http://localhost:3000", "http://localhost:8000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

root_ref = get_db()

class IntakeRequest(BaseModel):
    text: str
    source: str = "web"
    phone: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    domain: Optional[str] = "human"

class StatusUpdateRequest(BaseModel):
    need_id: str
    status: Literal["open", "in_progress", "resolved", "cancelled"]
    notes: Optional[str] = None

class VapiWebhookPayload(BaseModel):
    type: str
    transcript: Optional[str] = None
    recordingUrl: Optional[str] = None
    message: Optional[Dict[str, Any]] = None
    callerPhoneNumber: Optional[str] = None

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"message": "CommunityPulse API is running", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """Detailed health check for deployment monitoring."""
    db_status = "connected" if root_ref is not None else "disconnected"
    return {
        "status": "healthy",
        "database": db_status,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "environment": os.getenv("ENVIRONMENT", "development")
    }

@app.post("/intake")
async def process_intake(request: IntakeRequest, background_tasks: BackgroundTasks):
    """
    Primary intake for Web and WhatsApp reports.
    Uses AI to analyze and score incoming needs.
    
    Args:
        request: IntakeRequest with need description and optional metadata
        background_tasks: FastAPI background tasks for async operations
        
    Returns:
        dict: Success response with generated need ID
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    if root_ref is None:
        logger.error("Firebase database not configured")
        raise HTTPException(
            status_code=503,
            detail="Backend database is not configured. Check backend/.env and Firebase credentials.",
        )

    try:
        logger.info(f"Processing intake from {request.source} (domain: {request.domain})")
        
        # 1. AI Analysis
        ai_data = await extract_need_structure(request.text)
        scoring_data = await score_urgency(request.text)
        
        need_type = ai_data.get("need_type", "safety")
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
            logger.info(f"Need {need_id} saved with urgency score {scoring_data.get('urgency_score', 5)}")
            
            # 4. Critical Alert: Call Volunteer if Priority is 10
            urgency_score = scoring_data.get("urgency_score", 0)
            if urgency_score >= 10:
                volunteer_phone = os.getenv("VOLUNTEER_ALERT_PHONE")
                if volunteer_phone:
                    logger.warning(f"CRITICAL need detected (score: {urgency_score}). Triggering emergency call.")
                    background_tasks.add_task(trigger_emergency_call, volunteer_phone, request.text)
                    
            return {"status": "success", "id": need_id, "data": {"id": need_id, "urgency_score": urgency_score}}
        except Exception as db_error:
            logger.error(f"Database write error: {db_error}")
            raise HTTPException(status_code=500, detail="Failed to save need to database")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in intake processing: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/notify/vapi")
async def handle_vapi_webhook(payload: VapiWebhookPayload, background_tasks: BackgroundTasks):
    """
    Receives call data from the Vapi Voice Agent.
    
    Args:
        payload: VapiWebhookPayload with call details
        background_tasks: FastAPI background tasks
        
    Returns:
        dict: Webhook response
    """
    try:
        if payload.type != "end-of-call-report":
            logger.debug(f"Ignoring webhook of type: {payload.type}")
            return {"status": "ignored"}

        transcript = payload.transcript or ""
        recording_url = payload.recordingUrl
        
        if not transcript:
            logger.warning("Voice webhook received with empty transcript")
            return {"status": "error", "message": "No transcript provided"}
        
        logger.info("Processing voice agent webhook")
        
        # AI Analysis
        ai_data = await extract_need_structure(transcript)
        scoring_data = await score_urgency(transcript)
        
        need_id = str(uuid.uuid4())
        need_record = {
            "id": need_id,
            "raw_text": transcript,
            "description": transcript,
            "need_type": ai_data.get("need_type", "safety"),
            "location_name": ai_data.get("location_name", "Unknown"),
            "people_affected": ai_data.get("people_affected"),
            "status": "open",
            "source": "voice_agent",
            "recording_url": recording_url,
            "caller_phone": payload.callerPhoneNumber,
            "urgency_score": scoring_data.get("urgency_score", 5),
            "emotional_signal": scoring_data.get("emotional_signal", "concerned"),
            "tactical_assessment": scoring_data.get("tactical_assessment", "Voice report received."),
            "life_threat": scoring_data.get("life_threat", False),
            "created_at": {".sv": "timestamp"}
        }
        
        try:
            admin_db.reference(f"needs/{need_id}").set(need_record)
            logger.info(f"Voice need {need_id} saved with urgency score {scoring_data.get('urgency_score', 5)}")
            
            # Critical Alert: Call Volunteer if Priority is 10
            urgency_score = scoring_data.get("urgency_score", 0)
            if urgency_score >= 10:
                volunteer_phone = os.getenv("VOLUNTEER_ALERT_PHONE")
                if volunteer_phone:
                    logger.warning(f"CRITICAL voice need detected (score: {urgency_score})")
                    background_tasks.add_task(trigger_emergency_call, volunteer_phone, transcript)
            
            return {"status": "success", "id": need_id, "urgency_score": urgency_score}
            
        except Exception as db_error:
            logger.error(f"Database write error in voice webhook: {db_error}")
            return {"status": "error", "message": "Failed to save voice need"}
            
    except Exception as e:
        logger.error(f"Error handling voice webhook: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/status/update")
async def update_status(request: StatusUpdateRequest, background_tasks: BackgroundTasks):
    """
    Update mission status and notify reporter.
    
    Args:
        request: StatusUpdateRequest with need_id and new status
        background_tasks: FastAPI background tasks
        
    Returns:
        dict: Success response
    """
    try:
        need_id = request.need_id
        status = request.status
        
        if not need_id:
            raise HTTPException(status_code=400, detail="need_id is required")
        
        logger.info(f"Updating status for need {need_id} to {status}")
        
        need_ref = admin_db.reference(f"needs/{need_id}")
        update_data = {
            "status": status,
            "updated_at": {".sv": "timestamp"}
        }
        
        if request.notes:
            update_data["notes"] = request.notes
        
        try:
            need_ref.update(update_data)
            
            # Notify via Telegram if applicable
            snapshot = need_ref.get()
            if snapshot and snapshot.get("source") == "telegram":
                chat_id = snapshot.get("telegram_chat_id")
                if chat_id:
                    msg = f"ℹ**STATUS UPDATE**: Your request is now {status}."
                    if request.notes:
                        msg += f"\n\n{request.notes}"
                    background_tasks.add_task(send_telegram_message, chat_id, msg)
                    logger.info(f"Telegram notification queued for {chat_id}")
                    
            return {"status": "success", "need_id": need_id, "new_status": status}
            
        except Exception as db_error:
            logger.error(f"Database update error: {db_error}")
            raise HTTPException(status_code=500, detail="Failed to update status")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating status: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

if __name__ == "__main__":
    import uvicorn
    
    PORT = int(os.getenv("PORT", 8000))
    HOST = os.getenv("HOST", "0.0.0.0")
    DEBUG = os.getenv("DEBUG", "false").lower() == "true"
    
    logger.info(f"Starting server on {HOST}:{PORT} (debug={DEBUG})")
    uvicorn.run(app, host=HOST, port=PORT, debug=DEBUG)
