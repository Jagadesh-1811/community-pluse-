import os
from env import load_backend_env

# Load environment variables FIRST, before any other imports
load_backend_env()

import sentry_sdk

# Initialize Sentry
sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    traces_sample_rate=0.2,
    environment="prod" if "production" in os.getenv("ENVIRONMENT", "development") else "dev"
)

from fastapi import FastAPI, HTTPException, BackgroundTasks, Form, File, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict, Any, Literal, List
import uuid
import datetime
from database import get_db
from firebase_admin import db as admin_db, auth as admin_auth
from services.ai_service import extract_need_structure, score_urgency, generate_tactical_reply, generate_message_heading, check_gemini_status, check_for_incident_clustering, evaluate_escalation
from services.telegram_service import run_bot, send_telegram_message
from services.voice_service import trigger_emergency_call
from services.whatsapp_service import router as whatsapp_router
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi.middleware.cors import CORSMiddleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Background tasks on startup and cleanup on shutdown.
    """
    environment = os.getenv("ENVIRONMENT", "development")
    logger.info(f"[STARTUP] CommunityPulse Intelligence Engine v1.0.0 starting in {environment} mode...")
    
    # Verify Firebase connection
    try:
        test_ref = root_ref
        if test_ref is None:
            logger.warning("  Firebase reference is None - database operations may fail")
        else:
            logger.info(" Firebase database connection verified")
    except Exception as e:
        logger.error(f" Firebase verification failed: {e}")
    
    # Telegram bot enabled for production deployment
    try:
        asyncio.create_task(run_bot())
        logger.info("[BOT] Telegram Bot: ACTIVE (Production Mode)")
    except Exception as e:
        logger.error(f"[BOT ERROR] Telegram Bot Error: {e}")
        
    # Start Firebase Database listener for Sheets auto-export
    try:
        from services.sheets_service import export_incident_to_sheet, init_sheet
        
        # Test sheets configuration
        init_sheet()
        
        def db_listener(event):
            try:
                if event.path == "/":
                    logger.info("Firebase RTDB listener initial data received.")
                    return
                
                parts = event.path.strip("/").split("/")
                if not parts:
                    return
                need_id = parts[0]
                
                logger.info(f"Firebase RTDB event detected at {event.path}. Fetching need {need_id}...")
                need_ref = admin_db.reference(f"needs/{need_id}")
                need_data = need_ref.get()
                
                if need_data and isinstance(need_data, dict):
                    export_incident_to_sheet(need_id, need_data)
            except Exception as listen_err:
                logger.error(f"Error in Firebase RTDB listener callback: {listen_err}")

        # Starts listening in a background thread
        admin_db.reference("needs").listen(db_listener)
        logger.info(" Firebase RTDB listener for Google Sheets auto-export: ACTIVE")
    except Exception as e:
        logger.error(f" Failed to start Firebase RTDB Sheets listener: {e}")

    # Start periodic SLA escalation task
    async def periodic_sla_check():
        while True:
            try:
                await asyncio.sleep(30) # run check every 30 seconds
                logger.info("[SLA Checker] Running periodic SLA escalation check...")
                
                # Fetch all open needs
                needs_ref = admin_db.reference("needs")
                needs = needs_ref.get()
                if not needs or not isinstance(needs, dict):
                    continue
                
                now_ts = datetime.datetime.utcnow().timestamp() * 1000
                five_minutes_ms = 5 * 60 * 1000 # 5 minutes in milliseconds
                
                for nid, ndata in needs.items():
                    if ndata.get("status") in ("open", "notified") and not ndata.get("parent_incident_id"):
                        created_at = ndata.get("created_at")
                        if created_at and (now_ts - created_at) > five_minutes_ms:
                            if not ndata.get("sla_escalated"):
                                logger.info(f"[SLA Checker] Need {nid} is open for >5 minutes without volunteer. Running SLA escalation.")
                                
                                current_urgency = ndata.get("urgency_score", 5)
                                new_urgency = min(10, current_urgency + 2)
                                
                                siblings = []
                                for cid, cdata in needs.items():
                                    if cdata.get("parent_incident_id") == nid:
                                        siblings.append(cdata)
                                
                                escalation_result = await evaluate_escalation(ndata, siblings)
                                ai_new_urgency = escalation_result.get("new_urgency_score", new_urgency)
                                final_urgency = max(current_urgency + 1, ai_new_urgency)
                                final_urgency = min(10, final_urgency)
                                
                                reasoning = escalation_result.get("reasoning", "Incident has been active with no responder accepting within the 5-minute SLA.")
                                
                                updates = {
                                    "sla_escalated": True,
                                    "urgency_score": final_urgency,
                                    "escalation_reasoning": f"SLA ESCALATION WARNING: {reasoning}",
                                    "escalated_at": {".sv": "timestamp"},
                                    "dispatch_radius_expanded_km": 15.0
                                }
                                admin_db.reference(f"needs/{nid}").update(updates)
                                logger.warning(f"[SLA Checker] Need {nid} escalated to urgency {final_urgency}. Expanded dispatch radius to 15km.")
                                
                                dispatch_incident(nid, radius_km=15.0)
                                
                                if final_urgency >= 8:
                                    volunteer_phone = os.getenv("VOLUNTEER_ALERT_PHONE")
                                    if volunteer_phone:
                                        # Use asyncio background task
                                        asyncio.create_task(trigger_emergency_call(volunteer_phone, f"SLA ESCALATED: {ndata.get('raw_text', '')[:100]}"))
            except Exception as e:
                logger.error(f"[SLA Checker] Error in periodic SLA check: {e}")

    asyncio.create_task(periodic_sla_check())
    logger.info(" Periodic SLA Escalation check task initialized")

    yield

app = FastAPI(
    title="CommunityPulse API",
    description="Real-time crisis coordination and field reporting platform",
    version="1.0.0",
    lifespan=lifespan
)


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

app.include_router(whatsapp_router)

# Create and mount static files uploads directory
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

root_ref = get_db()

class IntakeRequest(BaseModel):
    text: str
    source: str = "web"
    phone: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    domain: Optional[str] = "human"
    reporter_email: Optional[str] = None
    webrtc_conversation: Optional[list] = None


class StatusUpdateRequest(BaseModel):
    need_id: str
    status: Literal["open", "in_progress", "resolved", "cancelled"]
    notes: Optional[str] = None

class VapiMessage(BaseModel):
    type: str
    transcript: Optional[str] = None
    recordingUrl: Optional[str] = None
    customer: Optional[Dict[str, Any]] = None
    call: Optional[Dict[str, Any]] = None

class VapiWebhookPayload(BaseModel):
    message: VapiMessage

class CreateVolunteerRequest(BaseModel):
    email: str
    domain: Literal["human", "animal"]
    categories: list
    password: Optional[str] = None

class VerifyCodeRequest(BaseModel):
    code: str
    role: str

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

def dispatch_incident(incident_id: str, radius_km: float = 10.0):
    """
    Search for available volunteers within a given radius (km) of an incident.
    If no volunteers are found in range, log a Sentry warning.
    """
    try:
        # Get incident location
        incident = admin_db.reference(f"needs/{incident_id}").get()
        if not incident:
            logger.warning(f"Incident {incident_id} not found for dispatch check.")
            return

        incident_lat = incident.get("lat")
        incident_lng = incident.get("lng")
        if incident_lat is None or incident_lng is None:
            # Missing coordinates or manual input with no coords
            sentry_sdk.capture_message(
                "No volunteers in range",
                level="warning",
                extras={"incident_id": incident_id, "radius_km": radius_km}
            )
            return

        # Fetch all volunteers
        volunteers = admin_db.reference("volunteers").get()
        if not volunteers:
            sentry_sdk.capture_message(
                "No volunteers in range",
                level="warning",
                extras={"incident_id": incident_id, "radius_km": radius_km}
            )
            return

        import math
        def distance(lat1, lon1, lat2, lon2):
            R = 6371
            dLat = math.radians(lat2 - lat1)
            dLon = math.radians(lon2 - lon1)
            a = math.sin(dLat / 2) * math.sin(dLat / 2) + \
                math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
                math.sin(dLon / 2) * math.sin(dLon / 2)
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            return R * c

        volunteers_in_range = []
        for vol_id, vol in volunteers.items():
            vol_lat = vol.get("lat")
            vol_lng = vol.get("lng")
            if vol_lat is not None and vol_lng is not None:
                dist = distance(incident_lat, incident_lng, vol_lat, vol_lng)
                if dist <= radius_km:
                    volunteers_in_range.append(vol_id)

        if not volunteers_in_range:
            sentry_sdk.capture_message(
                "No volunteers in range",
                level="warning",
                extras={"incident_id": incident_id, "radius_km": radius_km}
            )
    except Exception as e:
        logger.error(f"Error in dispatch_incident: {e}")
        sentry_sdk.capture_exception(e)


async def process_and_save_need_record(
    text: str,
    source: str,
    domain: str,
    phone: Optional[str],
    lat: Optional[float],
    lng: Optional[float],
    reporter_email: Optional[str],
    webrtc_conversation: Optional[list],
    recording_url: Optional[str] = None,
    image_url: Optional[str] = None,
    background_tasks: BackgroundTasks = None
):
    import json
    from services.ai_service import analyze_incident_image

    # 1. Fetch recent needs (last 10 minutes) for clustering check
    recent_needs = []
    if lat is not None and lng is not None:
        try:
            # Fetch last 50 needs to scan for duplicates
            needs_snapshot = admin_db.reference("needs").order_by_child("created_at").limit_to_last(50).get()
            if needs_snapshot and isinstance(needs_snapshot, dict):
                ten_minutes_ago = (datetime.datetime.utcnow() - datetime.timedelta(minutes=10)).timestamp() * 1000
                for nid, ndata in needs_snapshot.items():
                    if not ndata.get("parent_incident_id") and ndata.get("created_at", 0) >= ten_minutes_ago:
                        ndata["id"] = nid
                        recent_needs.append(ndata)
        except Exception as snap_err:
            logger.error(f"Error fetching recent needs: {snap_err}")

    # 2. Check for clustering
    parent_id = None
    if recent_needs and lat is not None and lng is not None:
        parent_id = await check_for_incident_clustering(text, lat, lng, recent_needs)

    if parent_id:
        logger.info(f"Clustering detected: Merging new report under parent incident {parent_id}")
        
        child_id = str(uuid.uuid4())
        child_record = {
            "id": child_id,
            "parent_incident_id": parent_id,
            "raw_text": text,
            "source": source,
            "phone": phone,
            "reporter_email": reporter_email,
            "created_at": {".sv": "timestamp"},
            "image_url": image_url
        }
        
        admin_db.reference(f"needs/{child_id}").set(child_record)
        
        parent_ref = admin_db.reference(f"needs/{parent_id}")
        parent_data = parent_ref.get()
        
        all_needs = admin_db.reference("needs").get()
        siblings = []
        if all_needs and isinstance(all_needs, dict):
            for nid, ndata in all_needs.items():
                if ndata.get("parent_incident_id") == parent_id:
                    siblings.append(ndata)
                    
        updated_description = (parent_data.get("description") or parent_data.get("raw_text") or "")
        updated_description += f"\n\n[Report #{len(siblings)+1} via {source}]: {text}"
        
        escalation_result = await evaluate_escalation(parent_data, siblings)
        new_urgency = escalation_result.get("new_urgency_score", parent_data.get("urgency_score", 5))
        
        updates = {
            "description": updated_description,
            "child_reports_count": len(siblings)
        }
        
        # 5+ reports triggers major incident and coordinated dispatch
        if len(siblings) >= 4:
            logger.warning(f"Major incident threshold reached (5+ reports) on cluster {parent_id}. Bumping urgency and dispatching single coordinated alert.")
            new_urgency = max(new_urgency, 9)
            updates["is_major_incident"] = True
            
        if new_urgency != parent_data.get("urgency_score"):
            logger.info(f"AI Escalation: Incident {parent_id} urgency score updated from {parent_data.get('urgency_score')} to {new_urgency}")
            updates["urgency_score"] = new_urgency
            updates["escalation_reasoning"] = escalation_result.get("reasoning")
            updates["escalated_at"] = {".sv": "timestamp"}
            
        parent_ref.update(updates)
        
        if len(siblings) == 4 and background_tasks:
            background_tasks.add_task(dispatch_incident, parent_id, 10.0)
            if new_urgency >= 10:
                volunteer_phone = os.getenv("VOLUNTEER_ALERT_PHONE")
                if volunteer_phone:
                    background_tasks.add_task(trigger_emergency_call, volunteer_phone, f"MAJOR CRITICAL EVENT Clustered: {updated_description[:100]}")

        return parent_id, new_urgency

    # 3. If NOT clustered: standard new need triage
    ai_data = await extract_need_structure(text)
    
    visual_data = {}
    scoring_data = {}
    urgency_score = 5
    tactical_assessment = "Incident report received."
    
    if image_url:
        local_path = os.path.join("uploads", image_url.split("/")[-1])
        if os.path.exists(local_path):
            try:
                visual_data = await analyze_incident_image(local_path, text)
                urgency_score = visual_data.get("verified_urgency_score", 5)
                tactical_assessment = visual_data.get("vision_assessment", "Visual assessment logged.")
            except Exception as vis_err:
                logger.error(f"Gemini Vision analysis failed: {vis_err}")
                scoring_data = await score_urgency(text)
                urgency_score = scoring_data.get("urgency_score", 5)
                tactical_assessment = scoring_data.get("tactical_assessment", "Defaulting to text scoring.")
        else:
            scoring_data = await score_urgency(text)
            urgency_score = scoring_data.get("urgency_score", 5)
            tactical_assessment = scoring_data.get("tactical_assessment", "Defaulting to text scoring.")
    else:
        scoring_data = await score_urgency(text)
        urgency_score = scoring_data.get("urgency_score", 5)
        tactical_assessment = scoring_data.get("tactical_assessment", "Defaulting to text scoring.")

    need_type = ai_data.get("need_type", "safety")
    if domain == "animal":
        need_type = "animal"

    need_id = str(uuid.uuid4())
    ai_heading = await generate_message_heading(text, "reporter")

    need_record = {
        "id": need_id,
        "raw_text": text,
        "description": text,
        "need_type": need_type,
        "domain": domain,
        "location_name": ai_data.get("location_name"),
        "ai_heading": ai_heading,
        "lat": lat,
        "lng": lng,
        "urgency_score": urgency_score,
        "emotional_signal": ai_data.get("urgency_signal") or scoring_data.get("emotional_signal") or "concerned",
        "life_threat": bool(scoring_data.get("life_threat") or visual_data.get("visual_severity") == "catastrophic"),
        "status": "open",
        "source": source,
        "phone": phone,
        "reporter_email": reporter_email,
        "webrtc_conversation": webrtc_conversation,
        "recording_url": recording_url,
        "image_url": image_url,
        "created_at": {".sv": "timestamp"},
        "visual_severity": visual_data.get("visual_severity"),
        "visual_hazards": visual_data.get("visual_hazards"),
        "tactical_assessment": tactical_assessment
    }

    admin_db.reference(f"needs/{need_id}").set(need_record)
    
    if background_tasks:
        background_tasks.add_task(dispatch_incident, need_id, 10.0)
        if phone:
            background_tasks.add_task(trigger_emergency_call, phone, text)
        if urgency_score >= 10:
            volunteer_phone = os.getenv("VOLUNTEER_ALERT_PHONE")
            if volunteer_phone:
                background_tasks.add_task(trigger_emergency_call, volunteer_phone, text)

    return need_id, urgency_score


@app.post("/intake")
async def process_intake(request: IntakeRequest, background_tasks: BackgroundTasks):
    """
    Primary intake for Web and WhatsApp reports.
    Uses AI to analyze, cluster, and score incoming needs.
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
        need_id, urgency_score = await process_and_save_need_record(
            text=request.text,
            source=request.source,
            domain=request.domain or "human",
            phone=request.phone,
            lat=request.lat,
            lng=request.lng,
            reporter_email=request.reporter_email,
            webrtc_conversation=request.webrtc_conversation,
            background_tasks=background_tasks
        )
        return {"status": "success", "id": need_id, "data": {"id": need_id, "urgency_score": urgency_score}}
    except Exception as e:
        logger.error(f"Error in process_intake: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/intake/image")
async def process_intake_image(
    background_tasks: BackgroundTasks,
    text: str = Form(...),
    source: str = Form("web"),
    phone: Optional[str] = Form(None),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    domain: Optional[str] = Form("human"),
    reporter_email: Optional[str] = Form(None),
    image: UploadFile = File(...)
):
    """
    Image-based intake. Saves the image and runs visual triage analysis via Gemini.
    """
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    if root_ref is None:
        logger.error("Firebase database not configured")
        raise HTTPException(
            status_code=503,
            detail="Backend database is not configured. Check backend/.env and Firebase credentials.",
        )

    try:
        # Save image file to static folder
        file_extension = os.path.splitext(image.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        local_path = os.path.join("uploads", unique_filename)
        with open(local_path, "wb") as buffer:
            content = await image.read()
            buffer.write(content)
        
        image_url = f"/uploads/{unique_filename}"
        
        need_id, urgency_score = await process_and_save_need_record(
            text=text,
            source=source,
            domain=domain or "human",
            phone=phone,
            lat=lat,
            lng=lng,
            reporter_email=reporter_email,
            webrtc_conversation=None,
            image_url=image_url,
            background_tasks=background_tasks
        )
        return {
            "status": "success",
            "id": need_id,
            "data": {
                "id": need_id,
                "urgency_score": urgency_score,
                "image_url": image_url
            }
        }
    except Exception as e:
        logger.error(f"Error in process_intake_image: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/notify/vapi")
async def handle_vapi_webhook(payload: dict, background_tasks: BackgroundTasks):
    """
    Receives call data from the Vapi Voice Agent.
    
    Args:
        payload: dict with call details
        background_tasks: FastAPI background tasks
        
    Returns:
        dict: Webhook response
    """
    import time
    try:
        msg = payload.get("message", {})
        msg_type = msg.get("type")
        if msg_type != "end-of-call-report":
            logger.debug(f"Ignoring webhook of type: {msg_type}")
            return {"status": "ignored"}

        transcript = msg.get("transcript") or ""
        recording_url = msg.get("recordingUrl")
        
        if not transcript:
            logger.warning("Voice webhook received with empty transcript")
            return {"status": "error", "message": "No transcript provided"}
        
        logger.info("Processing voice agent webhook")
        
        # AI Analysis
        ai_data = await extract_need_structure(transcript)
        scoring_data = await score_urgency(transcript)
        
        # Generate AI heading
        ai_heading = await generate_message_heading(transcript, "reporter")
        
        caller_phone = None
        customer = msg.get("customer")
        call = msg.get("call")
        if customer:
            caller_phone = customer.get("number")
        elif call:
            customer_obj = call.get("customer")
            if customer_obj:
                caller_phone = customer_obj.get("number")

        # Parse messages to build webrtc_conversation
        webrtc_conv = []
        raw_messages = msg.get("messages") or []
        for m in raw_messages:
            role = m.get("role")
            text = m.get("message") or m.get("text") or ""
            if role in ("user", "assistant") and text:
                webrtc_conv.append({
                    "role": role,
                    "text": text,
                    "timestamp": m.get("time") or int(time.time() * 1000)
                })

        need_id = str(uuid.uuid4())
        need_record = {
            "id": need_id,
            "raw_text": transcript,
            "description": transcript,
            "need_type": ai_data.get("need_type", "safety"),
            "location_name": ai_data.get("location_name", "Unknown"),
            "ai_heading": ai_heading,
            "people_affected": ai_data.get("people_affected"),
            "status": "open",
            "source": "voice_agent",
            "recording_url": recording_url,
            "caller_phone": caller_phone,
            "urgency_score": scoring_data.get("urgency_score", 5),
            "emotional_signal": scoring_data.get("emotional_signal", "concerned"),
            "tactical_assessment": scoring_data.get("tactical_assessment", "Voice report received."),
            "life_threat": scoring_data.get("life_threat", False),
            "webrtc_json": payload,
            "webrtc_conversation": webrtc_conv if webrtc_conv else None,
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
                    msg = f"**STATUS UPDATE**: Your request is now {status}."
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

# ── AI Heading Endpoint ────────────────────────────────────────────────────
class HeadingRequest(BaseModel):
    text: str
    sender: str = "reporter"  # "reporter" | "volunteer"

@app.post("/ai/heading")
async def get_message_heading(request: HeadingRequest):
    """
    Generate a short, context-aware AI heading for a chat message.
    Used by the frontend ChatPanel to label each bubble dynamically.
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    try:
        heading = await generate_message_heading(request.text, request.sender)
        return {"heading": heading}
    except Exception as e:
        logger.error(f"Heading generation failed: {e}")
        return {"heading": " Field Report" if request.sender == "reporter" else " Volunteer Update"}


# ── Gemini Status / Credit Check Endpoint ───────────────────────────────────
@app.get("/gemini/status")
async def gemini_status():
    """
    Check Gemini API connectivity and quota availability.
    Useful for debugging 429 quota errors or 404 model-not-found errors.
    """
    import asyncio
    loop = asyncio.get_event_loop()
    status = await loop.run_in_executor(None, check_gemini_status)
    return status

@app.post("/admin/create-volunteer")
async def create_volunteer(request: CreateVolunteerRequest, background_tasks: BackgroundTasks):
    """
    Create a volunteer account programmatically and email credentials.
    """
    import string
    import random
    from services.email_service import send_credentials_email
    
    try:
        # Generate secure random password if not provided
        password = request.password
        if not password or not password.strip():
            chars = string.ascii_letters + string.digits
            password = "".join(random.choice(chars) for _ in range(12))

        # Create user in Firebase Auth programmatically
        try:
            user = admin_auth.create_user(
                email=request.email,
                password=password,
                email_verified=True
            )
            uid = user.uid
        except Exception as auth_err:
            logger.error(f"Failed to create user in Firebase Auth: {auth_err}")
            raise HTTPException(status_code=400, detail=f"Firebase Auth creation failed: {str(auth_err)}")

        # Store user details in Firebase Realtime Database
        user_record = {
            "email": request.email,
            "role": "VOLUNTEER",
            "domain": request.domain,
            "categories": request.categories,
            "created_at": datetime.datetime.utcnow().isoformat() + "Z"
        }

        try:
            admin_db.reference(f"users/{uid}").set(user_record)
        except Exception as db_err:
            logger.error(f"Failed to save user role in Realtime Database: {db_err}")
            # Clean up auth user if DB save fails
            try:
                admin_auth.delete_user(uid)
            except Exception:
                pass
            raise HTTPException(status_code=500, detail="Database write failed, user rolled back.")

        # Dispatch email asynchronously in background tasks
        background_tasks.add_task(
            send_credentials_email,
            request.email,
            password,
            request.domain,
            request.categories
        )

        return {"status": "success", "uid": uid, "generated_password": password}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in create_volunteer: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/auth/verify-code")
async def verify_code(request: VerifyCodeRequest):
    """
    Verify the volunteer/admin access code securely on the backend.
    """
    valid_codes = os.getenv("VOLUNTEER_CODES", "PULSE_ADMIN_1,PULSE_VOLUNTEER_2,PULSE_RESCUE_3,PULSE_CORE_4").split(",")
    valid_codes = [c.strip() for c in valid_codes]
    
    if request.code in valid_codes:
        return {"status": "success", "valid": True}
    else:
        raise HTTPException(status_code=400, detail="INVALID ACCESS CODE: Volunteer commissioning requires a valid tactical code.")


class AcceptMissionRequest(BaseModel):
    volunteer_id: str
    volunteer_name: str


class AlreadyAcceptedError(Exception):
    def __init__(self, accepted_by_name: str):
        self.accepted_by_name = accepted_by_name


async def handle_post_acceptance_dispatch(incident_id: str, volunteer_id: str, accepted_by_name: str):
    import httpx
    try:
        # 1. Update responder status to "busy"
        admin_db.reference(f"volunteers/{volunteer_id}/status").set("busy")
        
        # 2. Notify other volunteers
        volunteers_ref = admin_db.reference("volunteers")
        all_volunteers = volunteers_ref.get()
        if not all_volunteers:
            return

        whatsapp_token = os.getenv("WHATSAPP_ACCESS_TOKEN")
        phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
        if not whatsapp_token or not phone_id:
            return

        url = f"https://graph.facebook.com/v18.0/{phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {whatsapp_token}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient() as client:
            for vol_id, vol_data in all_volunteers.items():
                if vol_id == volunteer_id:
                    continue
                vol_status = vol_data.get("status")
                notified_incident = vol_data.get("notified_incident_id")
                vol_phone = vol_data.get("phone")

                if vol_status == "notified" and notified_incident == incident_id and vol_phone:
                    admin_db.reference(f"volunteers/{vol_id}/status").set("available")
                    admin_db.reference(f"volunteers/{vol_id}/notified_incident_id").delete()

                    message_body = f"Mission {incident_id[:8]} has been accepted by {accepted_by_name}. Stand by."
                    payload = {
                        "messaging_product": "whatsapp",
                        "recipient_type": "individual",
                        "to": vol_phone,
                        "type": "text",
                        "text": {"body": message_body}
                    }
                    await client.post(url, headers=headers, json=payload)
    except Exception as e:
        logger.error(f"Error in post acceptance dispatch: {e}")


@app.post("/incidents/{incident_id}/recommend-volunteer")
async def recommend_volunteer_for_incident(incident_id: str):
    """
    Geospatial routing + Gemini intelligence: recommendation of best volunteer.
    """
    try:
        from services.ai_service import recommend_best_volunteer
        
        # 1. Fetch incident
        incident = admin_db.reference(f"needs/{incident_id}").get()
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
            
        incident_lat = incident.get("lat")
        incident_lng = incident.get("lng")
        if incident_lat is None or incident_lng is None:
            raise HTTPException(status_code=400, detail="Incident does not have location telemetry coords.")
            
        # 2. Fetch volunteers
        volunteers = admin_db.reference("volunteers").get()
        if not volunteers:
            return {
                "status": "success",
                "recommendation": {
                    "best_volunteer_id": None,
                    "reasoning": "No active field volunteers found in Firebase database."
                }
            }
            
        # 3. Call AI service helper with the prioritized Gemini key for Google Routes/Directions compatibility
        routes_api_key = os.getenv("GEMINI_API_KEY_3") or os.getenv("GEMINI_API_KEY")
        
        recommendation = await recommend_best_volunteer(
            incident_lat=incident_lat,
            incident_lng=incident_lng,
            incident_desc=incident.get("raw_text") or "",
            incident_type=incident.get("need_type") or "general",
            urgency_score=incident.get("urgency_score") or 5,
            volunteers=volunteers,
            routes_api_key=routes_api_key
        )
        
        return {
            "status": "success",
            "recommendation": recommendation
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error recommending volunteer: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Recommendation engine failed: {str(e)}")


@app.post("/incidents/{incident_id}/accept")
async def accept_incident_mission(
    incident_id: str,
    payload: AcceptMissionRequest,
    background_tasks: BackgroundTasks
):
    import time
    volunteer_id = payload.volunteer_id
    volunteer_name = payload.volunteer_name

    def accept_transaction(current_data: Any) -> Any:
        if current_data is None:
            raise ValueError("Incident not found")
        current_status = current_data.get("status", "open")
        if current_status != "open":
            raise AlreadyAcceptedError(
                accepted_by_name=current_data.get("accepted_by_name", "another volunteer")
            )
        current_data["status"] = "accepted"
        current_data["accepted_by"] = volunteer_id
        current_data["accepted_by_name"] = volunteer_name
        current_data["accepted_at"] = int(time.time() * 1000)
        return current_data

    try:
        incident_ref = admin_db.reference(f"incidents/{incident_id}")
        incident_ref.transaction(accept_transaction)
        logger.info(f"Incident {incident_id} successfully accepted by {volunteer_name} ({volunteer_id})")

        background_tasks.add_task(
            handle_post_acceptance_dispatch,
            incident_id=incident_id,
            volunteer_id=volunteer_id,
            accepted_by_name=volunteer_name
        )

        return {"status": "success", "message": "Mission accepted"}

    except AlreadyAcceptedError as err:
        raise HTTPException(
            status_code=409,
            detail=f"Already accepted by {err.accepted_by_name}"
        )
    except ValueError as err:
        raise HTTPException(
            status_code=404,
            detail=str(err)
        )
    except Exception as e:
        logger.error(f"Transaction failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Transaction failed"
        )


if __name__ == "__main__":
    import uvicorn
    
    PORT = int(os.getenv("PORT", 8000))
    HOST = os.getenv("HOST", "0.0.0.0")
    DEBUG = os.getenv("DEBUG", "false").lower() == "true"
    
    logger.info(f"Starting server on {HOST}:{PORT} (debug={DEBUG})")
    if DEBUG:
        uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
    else:
        uvicorn.run(app, host=HOST, port=PORT)
