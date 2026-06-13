import os
import uuid
import logging
from typing import Literal, Optional
import sentry_sdk
from fastapi import APIRouter, Request, Response, Query, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
import httpx
from firebase_admin import db as admin_db
from google import genai
from google.genai import types

# Setup logger and router
logger = logging.getLogger("whatsapp_webhook")
router = APIRouter()

# Schema for Gemini structured output
class TriageResult(BaseModel):
    category: Literal["medical", "shelter", "rescue", "other"] = Field(
        description="The triage category of the emergency report."
    )
    urgency_score: int = Field(
        description="Standardized Urgency Score from 1 (low) to 10 (life-threatening/critical).",
        ge=1,
        le=10
    )
    summary: str = Field(
        description="A concise summary of the crisis/incident on the ground."
    )
    requires_immediate_response: bool = Field(
        description="Set to True only if human lives/health are under immediate threat."
    )

@router.get("/webhook/whatsapp")
async def verify_whatsapp_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
):
    """
    Verifies the webhook subscription with Meta Cloud API.
    """
    verify_token = os.getenv("WHATSAPP_VERIFY_TOKEN")
    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        logger.info("WhatsApp webhook verified successfully.")
        return Response(content=hub_challenge, media_type="text/plain")
    
    logger.warning("WhatsApp webhook verification failed.")
    raise HTTPException(status_code=403, detail="Verification failed")

@router.post("/webhook/whatsapp")
async def receive_whatsapp_message(request: Request, background_tasks: BackgroundTasks):
    """
    Receives real-time updates and messages from Meta Cloud API.
    Processes message parsing and AI triage in a background task.
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Meta webhook requests can be status updates, only process messages
    entry = payload.get("entry", [])
    if not entry:
        return {"status": "ignored", "reason": "empty entry"}

    changes = entry[0].get("changes", [])
    if not changes:
        return {"status": "ignored", "reason": "empty changes"}

    value = changes[0].get("value", {})
    messages = value.get("messages", [])
    if not messages:
        return {"status": "ignored", "reason": "no messages in payload"}

    # Extract primary message object
    message_data = messages[0]
    phone_number_id = value.get("metadata", {}).get("phone_number_id")

    # Delegate intensive tasks (Gemini call, DB write, reply) to a background task
    background_tasks.add_task(
        process_whatsapp_pipeline, 
        message_data=message_data, 
        phone_number_id=phone_number_id
    )

    return {"status": "accepted"}

async def process_whatsapp_pipeline(message_data: dict, phone_number_id: str):
    """
    Handles payload parsing, AI triage, database storage, and confirmation dispatch.
    """
    try:
        reporter_phone = message_data.get("from")
        msg_type = message_data.get("type")
        
        # 1. Parse incoming content based on Meta message type structure
        message_text = ""
        lat, lng = None, None

        if msg_type == "text":
            message_text = message_data.get("text", {}).get("body", "")
        elif msg_type == "location":
            loc = message_data.get("location", {})
            lat = loc.get("latitude")
            lng = loc.get("longitude")
            name = loc.get("name", "")
            address = loc.get("address", "")
            message_text = f"[Sent Location Pin] {name} ({address})".strip()
        else:
            message_text = f"[Sent unsupported message format: {msg_type}]"

        # 2. Query Gemini 2.0 Flash using structured schema mode
        prompt = (
            "Analyze the following incoming field report from a disaster zone. "
            "Triage it into the correct category, assign a critical urgency score (1-10), "
            "summarize the situation, and determine if an immediate tactical response is required.\n\n"
            f"Report content: {message_text}"
        )

        try:
            # We enforce Pydantic structured output using GenerateContentConfig
            api_key = os.getenv("GEMINI_API_KEY_3") or os.getenv("GEMINI_API_KEY")
            gemini_client = genai.Client(api_key=api_key)
            ai_response = gemini_client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=TriageResult,
                    temperature=0.1,
                )
            )
            # Parse structured JSON output
            triage_data = TriageResult.model_validate_json(ai_response.text)
        except Exception as ai_err:
            logger.error(f"Gemini Triage Failed: {ai_err}")
            # Attach context and capture via Sentry
            sentry_sdk.set_context("incident", {"source": "whatsapp", "urgency": 5})
            sentry_sdk.capture_exception(ai_err)
            
            # Resilient fallback values in case of AI failures
            triage_data = TriageResult(
                category="other",
                urgency_score=5,
                summary=f"Incident report containing: '{message_text[:100]}...'",
                requires_immediate_response=False
            )

        # 3. Save to Firebase RTDB under /incidents/{incident_id}
        incident_id = str(uuid.uuid4())
        incident_record = {
            "source": "whatsapp",
            "reporter_phone": reporter_phone,
            "message": message_text,
            "lat": lat,
            "lng": lng,
            "category": triage_data.category,
            "urgency_score": triage_data.urgency_score,
            "summary": triage_data.summary,
            "status": "open",
            "timestamp": {".sv": "timestamp"}  # Firebase Server Timestamp placeholder
        }

        try:
            admin_db.reference(f"incidents/{incident_id}").set(incident_record)
            logger.info(f"Successfully saved WhatsApp incident {incident_id} to Firebase.")
        except Exception as db_err:
            logger.error(f"Firebase database write failed: {db_err}")

        # 4. Dispatch verification reply back to Meta API
        await send_whatsapp_reply(
            to_phone=reporter_phone, 
            phone_number_id=phone_number_id, 
            incident_id=incident_id
        )

    except Exception as pipeline_err:
        logger.error(f"Fatal error running WhatsApp pipeline: {pipeline_err}", exc_info=True)

async def send_whatsapp_reply(to_phone: str, phone_number_id: str, incident_id: str):
    """
    Posts message payload to Meta Cloud Graph API endpoint to notify the reporter.
    """
    token = os.getenv("WHATSAPP_ACCESS_TOKEN")
    phone_id = phone_number_id or os.getenv("WHATSAPP_PHONE_NUMBER_ID")

    if not token or not phone_id:
        logger.error("Outbound WhatsApp responder skipped: credentials missing in environment.")
        return

    url = f"https://graph.facebook.com/v18.0/{phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    confirmation_message = (
        f"🚨 *CommunityPulse Field Logged*\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"Your report has been successfully categorized by AI.\n"
        f"Incident ID: `{incident_id}`\n"
        f"Field dispatch units have been notified."
    )

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_phone,
        "type": "text",
        "text": {
            "body": confirmation_message
        }
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code == 200:
                logger.info(f"Outbound confirmation sent to {to_phone}.")
            else:
                logger.error(f"Meta Graph API error: {response.status_code} - {response.text}")
        except Exception as net_err:
            logger.error(f"Failed to post outbound request to Meta: {net_err}")
