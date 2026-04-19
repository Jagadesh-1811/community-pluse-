from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import uuid
from database import get_db
from services.ai_service import extract_need_structure, score_urgency
from services.whatsapp_service import send_whatsapp_confirmation
from services.notif_service import send_dispatch_notification

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CommunityPulse API")

# Add CORS middleware to allow communication with the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex="http://localhost:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = get_db()

class IntakeRequest(BaseModel):
    text: str
    source: str = "whatsapp"
    phone: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

@app.get("/")
async def root():
    return {"message": "CommunityPulse API is running"}

@app.post("/intake")
async def intake(request: IntakeRequest, background_tasks: BackgroundTasks):
    """
    FEATURE 1 & 2: Multi-modal intake (Text MVP) and Urgency Scoring.
    """
    if not request.text:
        raise HTTPException(status_code=400, detail="Text is required")

    # 1. Structure Extraction (Feature 1)
    extracted_data = await extract_need_structure(request.text)
    
    # 2. Urgency Scoring (Feature 2)
    scoring_data = await score_urgency(request.text)
    
    # 3. Prepare Supabase Record
    need_record = {
        "raw_text": request.text,
        "need_type": extracted_data.get("need_type"),
        "location_name": extracted_data.get("location_name"),
        "lat": request.lat,
        "lng": request.lng,
        "people_affected": extracted_data.get("people_affected"),
        "urgency_score": scoring_data.get("urgency_score"),
        "emotional_signal": scoring_data.get("emotional_signal"),
        "status": "open",
        "source": request.source,
        "phone": request.phone
    }
    
    # 4. Save to Supabase
    try:
        response = db.table("needs").insert(need_record).execute()
        new_need = response.data[0]
        need_id = new_need["id"]
        
        # 5. Send WhatsApp Confirmation (Feature 1)
        if request.phone:
            background_tasks.add_task(
                send_whatsapp_confirmation,
                to_phone=request.phone,
                need_id=need_id,
                need_type=new_need["need_type"],
                location=new_need["location_name"]
            )
            
        return {
            "status": "success",
            "message": f"Need logged. ID: #{need_id}",
            "data": new_need
        }
    except Exception as e:
        print(f"Database error: {e}")
        raise HTTPException(status_code=500, detail="Failed to log need to database")

class DispatchRequest(BaseModel):
    need_id: str

@app.post("/notify/dispatch")
async def notify_dispatch(request: DispatchRequest, background_tasks: BackgroundTasks):
    """
    Triggers an automated WhatsApp dispatch notification to the reporter.
    """
    background_tasks.add_task(send_dispatch_notification, request.need_id)
    return {"status": "accepted", "message": "Dispatch notification queued"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
