import os
import json
import threading
import asyncio
import datetime
import google.generativeai as genai
import sentry_sdk
from typing import Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# AllKeysExhaustedException
# ─────────────────────────────────────────────────────────────────────────────
class AllKeysExhaustedException(RuntimeError):
    """Raised when every key in the pool has hit its quota limit."""
    pass


# ─────────────────────────────────────────────────────────────────────────────
# GeminiKeyPool — 3-API auto-rotating key manager
# ─────────────────────────────────────────────────────────────────────────────
class GeminiKeyPool:
    """
    Three-agency key pool:

      Key 1 ──► quota exceeded?
                    │ YES
                    ▼
      Key 2 ──► quota exceeded?
                    │ YES
                    ▼
      Key 3 ──► quota exceeded?
                    │ YES
                    ▼
        AllKeysExhaustedException → graceful fallback (app stays up)

    Keys auto-reset every day at midnight (free-tier quota refreshes daily).

    .env variables:
        GEMINI_API_KEY    ← key 1 (required)
        GEMINI_API_KEY_2  ← key 2 (optional)
        GEMINI_API_KEY_3  ← key 3 (optional)
    """

    def __init__(self):
        k3 = os.getenv("GEMINI_API_KEY_3", "").strip()
        k1 = os.getenv("GEMINI_API_KEY", "").strip()
        k2 = os.getenv("GEMINI_API_KEY_2", "").strip()
        
        raw_keys = []
        if k3:
            raw_keys.append(k3)
        if k1:
            raw_keys.append(k1)
        if k2:
            raw_keys.append(k2)
            
        self.keys = raw_keys
        self._index = 0
        self._lock = threading.Lock()
        self._all_exhausted = False

        if not self.keys:
            print("[KeyPool] WARNING: No GEMINI_API_KEY found - AI features disabled.")
        else:
            total = len(self.keys)
            slots = [f"Key {i+1} {'OK' if i < total else 'NOT SET'}" for i in range(3)]
            print(f"[KeyPool] Loaded {total}/3 key(s): {' | '.join(slots)}")
            self._configure(self.keys[0])
            # Schedule daily midnight reset
            self._schedule_daily_reset()

    # ── internal ──────────────────────────────────────────────────────────────
    def _configure(self, key: str):
        genai.configure(api_key=key)

    def _rotate(self) -> bool:
        """Move to the next key. Returns True if one is available."""
        with self._lock:
            next_idx = self._index + 1
            if next_idx < len(self.keys):
                self._index = next_idx
                self._configure(self.keys[self._index])
                remaining = len(self.keys) - self._index - 1
                print(f"[KeyPool] ROTATING -> Key #{self._index + 1} "
                      f"({remaining} spare key(s) left after this one).")
                return True
            else:
                self._all_exhausted = True
                print(
                    "[KeyPool] ALL KEYS EXHAUSTED.\n"
                    "          App stays online - AI features return safe fallback responses.\n"
                    "          Quotas refresh at midnight. Auto-reset scheduled."
                )
                return False

    def _schedule_daily_reset(self):
        """Fire a reset at next midnight so quotas automatically refresh."""
        now = datetime.datetime.now()
        midnight = (now + datetime.timedelta(days=1)).replace(
            hour=0, minute=0, second=5, microsecond=0
        )
        delay = (midnight - now).total_seconds()

        def _do_reset():
            self.reset()
            self._schedule_daily_reset()   # reschedule for next day

        timer = threading.Timer(delay, _do_reset)
        timer.daemon = True
        timer.start()
        print(f"[KeyPool] Auto-reset scheduled in "
              f"{int(delay // 3600)}h {int((delay % 3600) // 60)}m (fires at midnight).")

    def reset(self):
        """Manually reset to Key 1 (also called automatically at midnight)."""
        with self._lock:
            self._index = 0
            self._all_exhausted = False
            if self.keys:
                self._configure(self.keys[0])
                print("[KeyPool] Daily reset complete - back to Key #1.")

    # ── properties ────────────────────────────────────────────────────────────
    @property
    def available(self) -> bool:
        return bool(self.keys)

    @property
    def all_exhausted(self) -> bool:
        return self._all_exhausted

    @property
    def active_key_number(self) -> int:
        return self._index + 1

    # ── core call with rotation ───────────────────────────────────────────────
    async def call(self, model_name: str, prompt: Any) -> str:
        """
        Call Gemini with full 3-key rotation.

        Key 1 → 429 → Key 2 → 429 → Key 3 → 429 → AllKeysExhaustedException
        Any non-quota error is re-raised immediately.
        """
        if not self.keys:
            raise RuntimeError("No Gemini API keys configured.")

        if self._all_exhausted:
            raise AllKeysExhaustedException(
                f"All {len(self.keys)} Gemini key(s) are quota-exhausted. "
                "Quotas refresh at midnight."
            )

        last_error: Optional[Exception] = None

        for attempt in range(len(self.keys)):
            try:
                model = genai.GenerativeModel(model_name)
                response = await model.generate_content_async(prompt)
                return response.text          # ✅ success
            except Exception as e:
                err = str(e)
                if "429" in err or "quota" in err.lower():
                    print(f"[KeyPool] Key #{self.active_key_number} -> 429 quota exceeded "
                          f"(attempt {attempt + 1}/{len(self.keys)}).")
                    last_error = e
                    if not self._rotate():
                        break               # no more keys
                else:
                    raise                   # e.g. 404, network error — not quota

        raise AllKeysExhaustedException(
            f"All {len(self.keys)} Gemini key(s) quota-exhausted. "
            f"Last error: {last_error}"
        )

    def status(self) -> Dict[str, Any]:
        """Pool status snapshot for /gemini/status endpoint."""
        return {
            "total_keys_configured": len(self.keys),
            "active_key_number": self.active_key_number,
            "keys_remaining": max(0, len(self.keys) - self._index),
            "all_exhausted": self._all_exhausted,
            "ai_online": not self._all_exhausted,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Singleton pool — shared across all service functions
# ─────────────────────────────────────────────────────────────────────────────
_pool = GeminiKeyPool()

# ── Model names ───────────────────────────────────────────────────────────────
# gemini-2.5-flash-lite : most generous free-tier RPD, fast → lightweight tasks
# gemini-2.5-flash      : better reasoning              → complex tasks
LIGHT_MODEL  = "gemini-2.5-flash-lite"   # extraction, heading
HEAVY_MODEL  = "gemini-2.5-flash"        # urgency scoring, tactical reply


# ─────────────────────────────────────────────────────────────────────────────
# Availability / credit check
# ─────────────────────────────────────────────────────────────────────────────
def check_gemini_status() -> Dict[str, Any]:
    """
    Synchronous check: ping each model and report quota/availability.
    Also returns key pool status.
    """
    import asyncio

    if not _pool.available:
        return {"status": "no_api_key", "pool": _pool.status(), "models": {}}

    results: Dict[str, Any] = {
        "status": "ok",
        "pool": _pool.status(),
        "models": {},
    }

    test_models = [LIGHT_MODEL, HEAVY_MODEL, "gemini-2.0-flash", "gemini-2.0-flash-lite"]

    for name in test_models:
        try:
            m = genai.GenerativeModel(name)
            # Use a tiny synchronous call for the status check
            loop = asyncio.new_event_loop()
            r = loop.run_until_complete(m.generate_content_async("ping"))
            loop.close()
            results["models"][name] = "ok"
        except Exception as e:
            err = str(e)
            if "429" in err or "quota" in err.lower():
                results["models"][name] = "quota_exceeded"
                results["status"] = "degraded"
            elif "404" in err or "not found" in err.lower():
                results["models"][name] = "not_available"
            else:
                results["models"][name] = f"error: {err[:100]}"

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Local Heuristics Fallback Engine (for API Quota Exceeded/Service Outages)
# ─────────────────────────────────────────────────────────────────────────────
def heuristic_need_structure(text: str) -> Dict[str, Any]:
    text_lower = text.lower()
    need_type = "safety"
    
    if any(kw in text_lower for kw in ["dog", "cat", "animal", "pet", "cow", "monkey", "stray"]):
        need_type = "animal"
    elif any(kw in text_lower for kw in ["water", "flood", "leak", "drink"]):
        need_type = "water"
    elif any(kw in text_lower for kw in ["food", "hungry", "meal", "starving"]):
        need_type = "food"
    elif any(kw in text_lower for kw in ["medical", "doctor", "hurt", "hospital", "bleed", "injury", "broken"]):
        need_type = "medical"
    elif any(kw in text_lower for kw in ["shelter", "home", "house", "building"]):
        need_type = "shelter"
        
    return {
        "need_type": need_type,
        "location_name": "Unknown Location",
        "people_affected": None,
        "urgency_signal": "Heuristic fallback parsing active.",
        "reported_by": None
    }

def heuristic_urgency_score(text: str) -> Dict[str, Any]:
    text_lower = text.lower()
    score = 5
    life_threat = False
    emotional_signal = "concerned"
    assessment = "AI engine fallback active. Score computed via local keywords heuristic."
    
    catastrophic_keywords = ["fire", "flood", "collapse", "trap", "bleed", "stroke", "heart attack", "unconscious", "explosion", "drown", "dying", "danger", "smoke", "tsunami", "earthquake", "accident", "trapped"]
    serious_keywords = ["hurt", "pain", "injury", "broken", "block", "leak", "electric", "gas", "water", "ambulance", "doctor", "hospital", "cut", "wound"]
    medium_keywords = ["food", "shelter", "supplies", "missing", "animal", "dog", "cat", "lost", "stray", "hungry", "starving"]
    
    if any(kw in text_lower for kw in catastrophic_keywords):
        score = 9
        life_threat = True
        emotional_signal = "critical"
    elif any(kw in text_lower for kw in serious_keywords):
        score = 7
        emotional_signal = "distressed"
    elif any(kw in text_lower for kw in medium_keywords):
        score = 5
        emotional_signal = "concerned"
    else:
        score = 4
        emotional_signal = "calm"
        
    return {
        "urgency_score": score,
        "emotional_signal": emotional_signal,
        "sentiment_analysis": {
            "fear_level": 8 if life_threat else 4,
            "anger_level": 3,
            "hope_level": 5,
            "fatigue_level": 6
        },
        "tactical_assessment": assessment,
        "life_threat": life_threat
    }


# ─────────────────────────────────────────────────────────────────────────────
# Feature 1: Extract structure from field report (lightweight)
# ─────────────────────────────────────────────────────────────────────────────
async def extract_need_structure(text: str) -> Dict[str, Any]:
    """Extract structured fields from a field report."""
    prompt = f"""Extract from this field report and return ONLY valid JSON:
{{
    "need_type": "food"|"water"|"medical"|"shelter"|"education"|"safety"|"animal",
    "location_name": "string",
    "people_affected": number or null,
    "urgency_signal": "any emotional or time-sensitive language found",
    "reported_by": "name if mentioned or null"
}}
Field report: {text}"""

    try:
        content = await _pool.call(LIGHT_MODEL, prompt)
        content = content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        return json.loads(content)
    except Exception as e:
        print(f"[AI] extract_need_structure error: {e}")
        sentry_sdk.set_context("incident", {"source": "web_or_telegram", "urgency": 5})
        sentry_sdk.capture_exception(e)
        return heuristic_need_structure(text)


# ─────────────────────────────────────────────────────────────────────────────
# Feature 2: Grief-aware urgency scoring (heavy — needs good reasoning)
# ─────────────────────────────────────────────────────────────────────────────
async def score_urgency(raw_text: str) -> Dict[str, Any]:
    """Grief-aware urgency scoring."""
    prompt = f"""[TACTICAL INTELLIGENCE PROTOCOL]
Analyze this field report for deep emotional signals and life-safety threats.
Return ONLY valid JSON:
{{
  "urgency_score": integer 1-10,
  "emotional_signal": "calm"|"concerned"|"distressed"|"panicked"|"desperate"|"grief-stricken"|"critical",
  "sentiment_analysis": {{
     "fear_level": 0-10,
     "anger_level": 0-10,
     "hope_level": 0-10,
     "fatigue_level": 0-10
  }},
  "tactical_assessment": "Short analytical summary of why this score was assigned.",
  "life_threat": boolean
}}

Field report transcript: {raw_text}"""

    try:
        content = await _pool.call(HEAVY_MODEL, prompt)
        content = content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        data = json.loads(content)

        # Grief-aware multiplier
        multipliers = {
            "grief-stricken": 1.5,
            "panicked":       1.4,
            "desperate":      1.35,
            "critical":       1.7,
            "distressed":     1.25,
            "concerned":      1.1,
            "calm":           1.0,
        }
        original_score = data.get("urgency_score", 5)
        signal         = data.get("emotional_signal", "calm")
        multiplier     = multipliers.get(signal, 1.0)
        boost          = 2 if data.get("life_threat") else 0
        data["urgency_score"] = min(10, int((original_score * multiplier) + boost))

        return data
    except Exception as e:
        print(f"[AI] score_urgency error: {e}")
        sentry_sdk.set_context("incident", {"source": "web_or_telegram", "urgency": 5})
        sentry_sdk.capture_exception(e)
        return heuristic_urgency_score(raw_text)


# ─────────────────────────────────────────────────────────────────────────────
# Feature 3: Tactical reply for reporter (heavy)
# ─────────────────────────────────────────────────────────────────────────────
async def generate_tactical_reply(user_message: str, ai_analysis: Dict[str, Any]) -> str:
    """Generates a short tactical instruction for the reporter."""
    prompt = f"""[TACTICAL RESPONSE PROTOCOL]
ROLE: Emergency Intelligence Assistant.
USER MESSAGE: "{user_message}"
AI ASSESSMENT: {json.dumps(ai_analysis)}

TASK: Write a 1-sentence tactical instruction for the victim/reporter.
- Be calm, professional, and helpful.
- If it's a medical emergency, give a safety tip.
- If priority 10 or life_threat=true, say a volunteer is being called immediately.
- Keep it under 160 characters.

REPLY ONLY WITH THE INSTRUCTION TEXT."""

    try:
        content = await _pool.call(HEAVY_MODEL, prompt)
        return content.strip().strip('"')
    except Exception as e:
        print(f"[AI] generate_tactical_reply error: {e}")
        return "✅ Report received. Stay safe and wait for further instructions."


# ─────────────────────────────────────────────────────────────────────────────
# Feature 4: Dynamic message heading (lightweight)
# ─────────────────────────────────────────────────────────────────────────────
async def generate_message_heading(text: str, sender: str) -> str:
    """
    Generates a 3-6 word context-aware heading for a chat or form message.
    Uses the lightweight model to conserve heavy-model quota.
    """
    role_context = (
        "This is a field REPORTER describing an emergency situation."
        if sender == "reporter"
        else "This is a VOLUNTEER updating the reporter on mission status."
    )

    prompt = f"""You are labelling messages in an emergency coordination app.
{role_context}

Message: "{text}"

Generate ONLY a short heading (3 to 6 words, Title Case) capturing the core meaning.
No punctuation at the end. No quotes. No explanation. Just the heading."""

    try:
        content = await _pool.call(LIGHT_MODEL, prompt)
        heading = content.strip().strip('"').strip("'")
        return heading[:60] if heading else _fallback_heading(sender)
    except Exception as e:
        print(f"[AI] generate_message_heading error: {e}")
        return _fallback_heading(sender)


def _fallback_heading(sender: str) -> str:
    return "Field Report" if sender == "reporter" else "Volunteer Update"


# ─────────────────────────────────────────────────────────────────────────────
# Feature 5: Multimodal Image Analysis (heavy)
# ─────────────────────────────────────────────────────────────────────────────
async def analyze_incident_image(image_path: str, text_report: str) -> Dict[str, Any]:
    """
    Analyzes an incident report text alongside an uploaded image of the damage using Gemini Vision.
    Extracts structured assessment data.
    """
    from PIL import Image
    
    prompt = f"""[TACTICAL VISION ANALYSIS PROTOCOL]
Analyze the uploaded image representing damage or emergency need alongside the user's text description.
Assess the severity of the damage, identify hazards, confirm or adjust the urgency, and summarize the visual findings.

Return ONLY valid JSON:
{{
  "visual_severity": "low"|"medium"|"high"|"catastrophic",
  "visual_hazards": ["list", "of", "hazards", "spotted"],
  "verified_urgency_score": integer 1-10,
  "vision_assessment": "1-2 sentence detailed summary of what is seen in the image relative to the text."
}}

Text report context: {text_report}"""

    try:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found at {image_path}")
            
        img = Image.open(image_path)
        
        # Call the key pool with both prompt text and PIL image
        content = await _pool.call(HEAVY_MODEL, [prompt, img])
        content = content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        return json.loads(content)
    except Exception as e:
        print(f"[AI] analyze_incident_image error: {e}")
        sentry_sdk.set_context("incident", {"source": "vision", "urgency": 5})
        sentry_sdk.capture_exception(e)
        h_data = heuristic_urgency_score(text_report)
        return {
            "visual_severity": "high" if h_data.get("life_threat") else "medium",
            "visual_hazards": ["Local heuristic fallback mode active"] + (["Potential Life Safety Threat"] if h_data.get("life_threat") else []),
            "verified_urgency_score": h_data.get("urgency_score", 5),
            "vision_assessment": f"AI vision pipeline bypassed. Heuristic triage active: {h_data.get('tactical_assessment')}",
        }

async def get_route_metrics(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float, api_key: str) -> Dict[str, Any]:
    """
    Calls Google Routes API to get distance (meters) and duration (seconds) with real-time traffic info.
    If the API call fails or key is missing, falls back to haversine distance + speed estimation.
    """
    import httpx
    
    if not api_key:
        return haversine_fallback(origin_lat, origin_lng, dest_lat, dest_lng)
        
    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters"
    }
    
    body = {
        "origin": {
            "location": {
                "latLng": {
                    "latitude": origin_lat,
                    "longitude": origin_lng
                }
            }
        },
        "destination": {
            "location": {
                "latLng": {
                    "latitude": dest_lat,
                    "longitude": dest_lng
                }
            }
        },
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=body, headers=headers, timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                routes = data.get("routes", [])
                if routes:
                    route = routes[0]
                    distance_meters = route.get("distanceMeters")
                    duration_str = route.get("duration") # e.g. "1200s"
                    
                    duration_seconds = 0
                    if duration_str and duration_str.endswith("s"):
                        duration_seconds = float(duration_str[:-1])
                    else:
                        duration_seconds = float(duration_str)
                        
                    return {
                        "distance_km": round(distance_meters / 1000.0, 2),
                        "duration_min": round(duration_seconds / 60.0, 1),
                        "source": "Google Routes API (Real-Time Traffic)"
                    }
    except Exception as e:
        print(f"[AI] Google Routes API error: {e}. Falling back to haversine.")
        
    return haversine_fallback(origin_lat, origin_lng, dest_lat, dest_lng)

def haversine_fallback(lat1, lon1, lat2, lon2) -> Dict[str, Any]:
    import math
    R = 6371.0 # Radius of the earth in km
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) * math.sin(d_lat / 2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(d_lon / 2) * math.sin(d_lon / 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance_km = R * c
    
    # Estimate speed: 30 km/h in chaotic disaster environments
    estimated_speed_kph = 30.0
    duration_hours = distance_km / estimated_speed_kph
    duration_min = duration_hours * 60.0
    
    return {
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_min, 1),
        "source": "Haversine Geodesic (30km/h Base Speed Estimate)"
    }

async def recommend_best_volunteer(
    incident_lat: float,
    incident_lng: float,
    incident_desc: str,
    incident_type: str,
    urgency_score: int,
    volunteers: list,
    routes_api_key: str
) -> Dict[str, Any]:
    """
    Asks Gemini to choose the best volunteer based on geographic routes details (distance + traffic) and sectors.
    """
    # 1. Fetch Routes API info for each volunteer
    enriched_volunteers = []
    for vol_id, vol in volunteers.items() if isinstance(volunteers, dict) else enumerate(volunteers):
        # Handle dict format vs list format safely
        vol_data = vol if isinstance(volunteers, list) else vol
        actual_id = vol_data.get("id") or vol_id
        
        vol_lat = vol_data.get("lat")
        vol_lng = vol_data.get("lng")
        if vol_lat is None or vol_lng is None:
            continue
            
        metrics = await get_route_metrics(vol_lat, vol_lng, incident_lat, incident_lng, routes_api_key)
        enriched_volunteers.append({
            "id": actual_id,
            "name": vol_data.get("name"),
            "sectors": vol_data.get("categories") or vol_data.get("categories_list") or [],
            "domain": vol_data.get("domain", "human"),
            "status": vol_data.get("status", "available"),
            "distance_km": metrics["distance_km"],
            "duration_min": metrics["duration_min"],
            "route_source": metrics["source"]
        })
        
    if not enriched_volunteers:
        return {
            "best_volunteer_id": None,
            "reasoning": "No active volunteers have valid GPS telemetry coordinates."
        }
        
    # 2. Build the Gemini Dispatch Prompt
    prompt = f"""[TACTICAL DISPATCH INTELLIGENCE PROTOCOL]
You are the Strategic Dispatch AI for CommunityPulse. Your mission is to analyze the incident and select the single best volunteer from the list below.

INCIDENT DETAILS:
- Description: "{incident_desc}"
- Sector/Type: {incident_type}
- Urgency Score: {urgency_score}/10

AVAILABLE VOLUNTEERS:
{json.dumps(enriched_volunteers, indent=2)}

DIRECTIONS:
1. Prioritize volunteers whose status is "available" and who support the incident domain/sector (e.g. animal domain for animal needs).
2. Prioritize volunteers with the shortest travel duration (duration_min, which is traffic-aware).
3. Provide a clear tactical reasoning for your choice.

Return ONLY valid JSON:
{{
  "best_volunteer_id": "string or null",
  "reasoning": "Detailed explanation mentioning the volunteer's name, distance, traffic-aware travel time, and why they fit the mission."
}}
"""
    try:
        content = await _pool.call(HEAVY_MODEL, prompt)
        content = content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        result = json.loads(content)
        # Attach the routes/telemetry details of the recommendation
        best_id = result.get("best_volunteer_id")
        best_vol = next((v for v in enriched_volunteers if v["id"] == best_id), None)
        if best_vol:
            result["volunteer_name"] = best_vol["name"]
            result["distance_km"] = best_vol["distance_km"]
            result["duration_min"] = best_vol["duration_min"]
            result["route_source"] = best_vol["route_source"]
            
        return result
    except Exception as e:
        print(f"[AI] recommend_best_volunteer error: {e}")
        # Return fallback (e.g., shortest haversine distance)
        best_vol = min(enriched_volunteers, key=lambda v: v["duration_min"])
        return {
            "best_volunteer_id": best_vol["id"],
            "volunteer_name": best_vol["name"],
            "distance_km": best_vol["distance_km"],
            "duration_min": best_vol["duration_min"],
            "route_source": best_vol["route_source"],
            "reasoning": f"Fallback selection: {best_vol['name']} was selected using distance estimation due to AI dispatch system timeout."
        }

async def check_for_incident_clustering(
    new_text: str,
    new_lat: float,
    new_lng: float,
    recent_needs: list
) -> Optional[str]:
    """
    Compares the new report with a list of recent needs (e.g. within 2km, last 12 hours) using Gemini.
    Returns the parent need ID if it belongs to an existing incident cluster, otherwise None.
    """
    if not recent_needs:
        return None

    import math
    def distance(lat1, lon1, lat2, lon2):
        R = 6371.0
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = math.sin(d_lat / 2) * math.sin(d_lat / 2) + \
            math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
            math.sin(d_lon / 2) * math.sin(d_lon / 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    candidate_needs = []
    for need in recent_needs:
        n_lat = need.get("lat")
        n_lng = need.get("lng")
        if n_lat is not None and n_lng is not None:
            dist = distance(new_lat, new_lng, n_lat, n_lng)
            if dist <= 2.0:
                candidate_needs.append({
                    "id": need.get("id"),
                    "text": need.get("raw_text") or need.get("description"),
                    "distance_km": round(dist, 2),
                    "created_at": need.get("created_at")
                })

    if not candidate_needs:
        return None

    prompt = f"""[TACTICAL CLUSTERING PROTOCOL]
You are a Dispatch Analyst. Determine if the new field report describes the same physical incident as any of the existing candidate incidents.
Events should only be clustered if they describe the exact same event (e.g., the same fire, the same flooded street, the same road blockage). If they are different events (e.g., an injured dog vs a fire in the same block), they should NOT be clustered.

NEW REPORT:
"{new_text}"

EXISTING CANDIDATE INCIDENTS (within 2km):
{json.dumps(candidate_needs, indent=2)}

Return ONLY valid JSON:
{{
  "is_duplicate_or_subevent": true|false,
  "matched_incident_id": "string or null"
}}
"""
    try:
        content = await _pool.call(LIGHT_MODEL, prompt)
        content = content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        res = json.loads(content)
        if res.get("is_duplicate_or_subevent") and res.get("matched_incident_id"):
            return res.get("matched_incident_id")
    except Exception as e:
        print(f"[AI] check_for_incident_clustering error: {e}")
    return None

async def evaluate_escalation(
    parent_incident: Dict[str, Any],
    child_reports: list
) -> Dict[str, Any]:
    """
    Analyzes parent incident description + merged child reports to see if severity should escalate.
    """
    all_reports = [parent_incident.get("raw_text") or ""]
    for r in child_reports:
        all_reports.append(r.get("raw_text") or "")
        
    prompt = f"""[TACTICAL ESCALATION PROTOCOL]
Analyze this cluster of crisis reports describing the same emergency. 
Determine if conditions are worsening (e.g., fire spreading, flood waters rising, people trapped, structural collapse) or if the volume of reports (number of duplicates) indicates a massive escalation.

ALL MERGED REPORTS FOR THIS INCIDENT:
{json.dumps(all_reports, indent=2)}

CURRENT URGENCY SCORE: {parent_incident.get("urgency_score", 5)}/10

Return ONLY valid JSON:
{{
  "should_escalate": true|false,
  "new_urgency_score": integer 1-10,
  "reasoning": "Brief justification for why this was escalated or kept the same."
}}
"""
    try:
        content = await _pool.call(HEAVY_MODEL, prompt)
        content = content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        return json.loads(content)
    except Exception as e:
        print(f"[AI] evaluate_escalation error: {e}")
        return {
            "should_escalate": False,
            "new_urgency_score": parent_incident.get("urgency_score", 5),
            "reasoning": "Escalation evaluation bypassed due to engine exception."
        }
