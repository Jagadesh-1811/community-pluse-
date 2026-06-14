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
                return response.text          #  success
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
        
    emergency_category = "reassurance_transport"
    
    # 1. Check for medical sub-categories first
    if any(kw in text_lower for kw in ["cpr", "cardiac", "heart stop", "collapse"]):
        emergency_category = "cardiac_cpr"
    elif "chok" in text_lower:
        emergency_category = "choking"
    elif any(kw in text_lower for kw in ["bleed", "wound", "cut", "blood"]):
        emergency_category = "bleeding"
    elif any(kw in text_lower for kw in ["stroke", "heart attack", "chest pain"]):
        emergency_category = "heart_stroke"
    elif any(kw in text_lower for kw in ["seizure", "convul", "fit", "unconscious"]):
        emergency_category = "seizure_unconscious"
    elif any(kw in text_lower for kw in ["fracture", "broken bone", "sprain", "strain", "sling"]):
        emergency_category = "fracture_sprain"
    elif any(kw in text_lower for kw in ["burn", "scald"]):
        emergency_category = "burns"
    elif any(kw in text_lower for kw in ["heat", "sun", "hyperthermia"]):
        emergency_category = "heat_stroke"
    elif any(kw in text_lower for kw in ["bite", "sting", "snake", "insect"]):
        emergency_category = "animal_bite"
    
    # 2. Check for rescue and safety categories
    else:
        if any(kw in text_lower for kw in ["lift", "elevator", "stuck", "trap", "rescue", "debris", "collapse", "confined"]):
            emergency_category = "entrapment_rescue"
        elif any(kw in text_lower for kw in ["fire", "smoke", "evacuate", "burn building", "extinguisher"]):
            emergency_category = "fire_evacuation"
        elif any(kw in text_lower for kw in ["flood", "flooded", "rising water", "heavy rain"]):
            emergency_category = "flood_safety"
        elif any(kw in text_lower for kw in ["earthquake", "quake", "cyclone", "tornado", "storm", "hurricane"]):
            emergency_category = "extreme_weather"
        elif need_type == "water" or need_type == "food" or any(kw in text_lower for kw in ["hungry", "starv", "purif", "hyg"]):
            emergency_category = "food_water_hygiene"
        elif need_type == "shelter" or any(kw in text_lower for kw in ["cold", "tent", "tarp", "homeless"]):
            emergency_category = "shelter_safety"
        
    return {
        "need_type": need_type,
        "location_name": "Unknown Location",
        "people_affected": None,
        "urgency_signal": "Heuristic fallback parsing active.",
        "reported_by": None,
        "emergency_category": emergency_category
    }

def heuristic_urgency_score(text: str) -> Dict[str, Any]:
    text_lower = text.lower()
    score = 5
    life_threat = False
    emotional_signal = "concerned"
    assessment = "AI engine fallback active. Score computed via local keywords heuristic."
    
    catastrophic_keywords = ["fire", "flood", "collapse", "trap", "bleed", "stroke", "heart attack", "unconscious", "explosion", "drown", "dying", "danger", "smoke", "tsunami", "earthquake", "accident", "trapped", "lift", "elevator", "stuck", "entrap", "entrapped"]
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
    "reported_by": "name if mentioned or null",
    "emergency_category": "cardiac_cpr"|"choking"|"bleeding"|"heart_stroke"|"seizure_unconscious"|"fracture_sprain"|"burns"|"heat_stroke"|"animal_bite"|"flood_safety"|"food_water_hygiene"|"shelter_safety"|"reassurance_transport"|null
}}

Guidelines for "emergency_category":
- Use "cardiac_cpr" for cardiac arrest, CPR, heart stopping, collapse, unresponsive and not breathing.
- Use "choking" for choking, blockage in throat, unable to breathe due to food/object.
- Use "bleeding" for severe bleeding, wounds, cuts, hemorrhages.
- Use "heart_stroke" for suspected heart attacks, chest pain, stroke, facial droop, slurred speech (FAST symptoms).
- Use "seizure_unconscious" for seizures, fits, convulsions, or unconscious but breathing individuals.
- Use "fracture_sprain" for broken bones, fractures, sprains, strains, arm/leg injuries.
- Use "burns" for thermal, chemical, or electrical burns and scalds.
- Use "heat_stroke" for heat exhaustion, heat stroke, high temperature due to sun/heat.
- Use "animal_bite" for animal bites, snake bites, dog bites, insect stings.
- Use "flood_safety" for flood, flooding, rising water, heavy rain water logging, water enters house.
- Use "food_water_hygiene" for food requests, starvation, drinking water requests, water purification, sanitation.
- Use "shelter_safety" for housing damage, cold, tent/tarp requests, homeless rescue, structural safety.
- Use "reassurance_transport" for other emergencies, general safety monitoring, or reassurance while waiting for help.

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
        return " Report received. Stay safe and wait for further instructions."


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
        return heading[:60] if heading else _fallback_heading_text(text, sender)
    except Exception as e:
        print(f"[AI] generate_message_heading error: {e}")
        return _fallback_heading_text(text, sender)


def _fallback_heading(sender: str) -> str:
    return "Field Report" if sender == "reporter" else "Volunteer Update"


def _fallback_heading_text(text: str, sender: str) -> str:
    if not text or not text.strip():
        return _fallback_heading(sender)
    
    # Extract the first 5 words as a heading
    words = text.strip().split()
    short_text = " ".join(words[:5])
    if len(words) > 5:
        short_text += "..."
    # Title Case
    return short_text.title()


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

def decode_polyline(polyline_str: str) -> list:
    """Decodes a Google encoded polyline string into a list of [lat, lng] coordinates."""
    index, lat, lng = 0, 0, 0
    coordinates = []
    changes = {'latitude': 0, 'longitude': 0}
    
    try:
        while index < len(polyline_str):
            for unit in ['latitude', 'longitude']:
                shift, result = 0, 0
                while True:
                    byte = ord(polyline_str[index]) - 63
                    index += 1
                    result |= (byte & 0x1f) << shift
                    shift += 5
                    if not (byte & 0x20):
                        break
                change = ~(result >> 1) if (result & 1) else (result >> 1)
                changes[unit] += change

            coordinates.append([changes['latitude'] / 1e5, changes['longitude'] / 1e5])
    except Exception:
        pass
    return coordinates

async def get_route_metrics(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float, api_key: str) -> Dict[str, Any]:
    """
    Calls Google Routes API to get distance (meters), duration (seconds), and polyline details.
    If the API call fails or key is missing, falls back to haversine distance + speed estimation.
    """
    import httpx
    
    if not api_key:
        return haversine_fallback(origin_lat, origin_lng, dest_lat, dest_lng)
        
    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline"
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
                        
                    encoded_polyline = route.get("polyline", {}).get("encodedPolyline")
                    polyline_coords = decode_polyline(encoded_polyline) if encoded_polyline else [[origin_lat, origin_lng], [dest_lat, dest_lng]]
                    
                    return {
                        "distance_km": round(distance_meters / 1000.0, 2),
                        "duration_min": round(duration_seconds / 60.0, 1),
                        "source": "Google Routes API (Real-Time Traffic)",
                        "polyline": polyline_coords
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
        "source": "Haversine Heuristic (Calculated)",
        "polyline": [[lat1, lon1], [lat2, lon2]]
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
            "route_source": metrics["source"],
            "polyline": metrics.get("polyline")
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
            result["polyline"] = best_vol.get("polyline")
            
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
            "polyline": best_vol.get("polyline"),
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


# ─────────────────────────────────────────────────────────────────────────────
# Feature 9: Curated YouTube First Aid Video Catalog (Approach 1)
# ─────────────────────────────────────────────────────────────────────────────
EMERGENCY_VIDEO_CATALOG = {
    "cardiac_cpr": {
        "category": "cardiac_cpr",
        "primary": {
            "title": "How to Do CPR on an Adult – First Aid Training",
            "youtube_id": "BQNNOh8c8ks",
            "description": "St John Ambulance UK trainer demonstrates full adult CPR with rescue breaths, step-by-step. Includes pandemic-era compression-only adaptation note."
        },
        "alternatives": [
            {
                "title": "First Aid for Someone Who Is Unresponsive and Not Breathing",
                "youtube_id": "gDmy0of0XAk",
                "description": "British Red Cross (2024) — covers collapse response, calling 999, and initiating CPR. Narrative + step-by-step + key steps format."
            },
            {
                "title": "CPR Training from the American Heart Association",
                "youtube_id": "RNWi4tF9uOA",
                "description": "American Heart Association (2023) — official CPR training video emphasising that immediate CPR can double or triple cardiac arrest survival odds."
            }
        ]
    },
    "choking": {
        "category": "choking",
        "primary": {
            "title": "First Aid for Someone Who Is Choking",
            "youtube_id": "WeY4KJUnfMc",
            "description": "British Red Cross (June 2024) — adult choking response with back blows and abdominal thrusts, structured as story + step-by-step + key steps recap."
        },
        "alternatives": [
            {
                "title": "Baby First Aid: Choking",
                "youtube_id": "z-3IAG_974o",
                "description": "British Red Cross (July 2024) — infant-specific choking technique using back blows and chest thrusts, clearly differentiated from adult method."
            },
            {
                "title": "Children First Aid: Choking Child",
                "youtube_id": "GymXjJJ7Ugo",
                "description": "British Red Cross — animated guide for choking in children, focusing on the back-blow technique appropriate for paediatric patients."
            }
        ]
    },
    "bleeding": {
        "category": "bleeding",
        "primary": {
            "title": "First Aid Training: Life-Threatening Bleeding",
            "youtube_id": "p9KHec6xfuw",
            "description": "St John Ambulance UK — covers severe bleeding control and tourniquet application. Most current tourniquet-inclusive video from SJA."
        },
        "alternatives": [
            {
                "title": "How to Treat Severe Bleeding – First Aid Training",
                "youtube_id": "NxO5LvgqZe0",
                "description": "St John Ambulance UK — trainer explains direct pressure, elevation, and wound packing for dramatic severe bleeds before emergency services arrive."
            },
            {
                "title": "First Aid for Someone Who Is Bleeding Heavily",
                "youtube_id": "L6jjyikFwmA",
                "description": "British Red Cross (June 2024) — step-by-step severe bleeding response with clear key-steps recap and guidance on when to call 999."
            }
        ]
    },
    "heart_stroke": {
        "category": "heart_stroke",
        "primary": {
            "title": "First Aid for Someone Having a Heart Attack",
            "youtube_id": "vYWFVebej5A",
            "description": "British Red Cross (September 2024) — recognising heart attack symptoms, calling 999, aspirin guidance, and keeping the patient calm while waiting for help."
        },
        "alternatives": [
            {
                "title": "Stroke: First Aid Steps and Key Action",
                "youtube_id": "yFFptA_IWS0",
                "description": "British Red Cross (September 2024) — concise FAST-based stroke first aid with a step-by-step recap, optimised for bystander recognition and response."
            },
            {
                "title": "What to Do If Someone Has a Stroke – Signs and Symptoms",
                "youtube_id": "PhH9a0kIwmk",
                "description": "St John Ambulance UK — trainer covers the FAST acronym, common stroke presentations, and immediate response steps."
            }
        ]
    },
    "seizure_unconscious": {
        "category": "seizure_unconscious",
        "primary": {
            "title": "First Aid for Someone Having a Seizure",
            "youtube_id": "1SMFUwyEafw",
            "description": "British Red Cross (August 2024) — what to do during and after a seizure, when to call 999, and how to protect the patient from injury."
        },
        "alternatives": [
            {
                "title": "The Recovery Position – First Aid Training",
                "youtube_id": "GmqXqwSV3bo",
                "description": "St John Ambulance UK — trainer demonstrates placing an unresponsive breathing adult into the recovery position safely while waiting for help."
            },
            {
                "title": "How to Do the Primary Survey – First Aid Training",
                "youtube_id": "ea1RJUOiNfQ",
                "description": "St John Ambulance UK — DRABC primary survey for assessing unresponsive casualties; essential precursor to seizure and unconsciousness response."
            }
        ]
    },
    "fracture_sprain": {
        "category": "fracture_sprain",
        "primary": {
            "title": "How to Treat a Fracture and Fracture Types – First Aid Training",
            "youtube_id": "2v8vlXgGXwE",
            "description": "St John Ambulance UK — trainer covers open vs closed fractures, immobilisation principles, and when to call for emergency help."
        },
        "alternatives": [
            {
                "title": "How to Make a Sling – First Aid Training",
                "youtube_id": "PwfBGkBXkFA",
                "description": "St John Ambulance UK — demonstrates both arm sling and elevation sling, with guidance on which injury type each suits."
            },
            {
                "title": "First Aid Manual: Treating Strains and Sprains",
                "youtube_id": "YcK45_xgAks",
                "description": "St John Ambulance-endorsed — RICE method for sprains and strains with clear demonstration of when imaging may be required."
            }
        ]
    },
    "burns": {
        "category": "burns",
        "primary": {
            "title": "How to Treat Burns and Scalds – First Aid Training",
            "youtube_id": "EaJmzB8YgS0",
            "description": "St John Ambulance UK — identifies burn severity, demonstrates 10-minute cool-water treatment, and covers what not to do (no butter, no ice, no burst blisters)."
        },
        "alternatives": [
            {
                "title": "First Aid: Helping Someone Who Has a Burn",
                "youtube_id": "IOtnGl_9-qw",
                "description": "British Red Cross — short-form burn treatment guide, covering cooling, covering, and calling for help, with a focus on child scenarios."
            },
            {
                "title": "First Aid for Severe Allergic Reactions",
                "youtube_id": "8EyYTW-1EP0",
                "description": "British Red Cross (July 2024) — chemical exposure and anaphylactic shock response, relevant to chemical burn and severe skin reaction scenarios."
            }
        ]
    },
    "heat_stroke": {
        "category": "heat_stroke",
        "primary": {
            "title": "How to Treat Heat Stroke, Signs and Symptoms – First Aid Training",
            "youtube_id": "jvGC_dQJUtE",
            "description": "St John Ambulance UK — trainer explains how to distinguish heat stroke from heat exhaustion and the emergency cooling steps required for heat stroke."
        },
        "alternatives": [
            {
                "title": "How to Treat Heat Exhaustion, Signs and Symptoms – First Aid Training",
                "youtube_id": "R6VdoV8dZRc",
                "description": "St John Ambulance UK — covers the milder but dangerous precursor to heat stroke: recognition, hydration, rest, and when to escalate to emergency services."
            },
            {
                "title": "First Aid for Someone with Hypothermia",
                "youtube_id": "DewzkBh2onc",
                "description": "British Red Cross (September 2024) — temperature-related emergency on the cold end; a useful pairing for comprehensive temperature-extremes first aid training."
            }
        ]
    },
    "animal_bite": {
        "category": "animal_bite",
        "primary": {
            "title": "Bites and Stings – Animated",
            "youtube_id": "7Fh3v5c6FY4",
            "description": "St John Ambulance UK animated guide covering animal bites, insect stings, and initial wound care including when to seek medical attention."
        },
        "alternatives": [
            {
                "title": "First Aid for Severe Allergic Reactions (Anaphylaxis)",
                "youtube_id": "8EyYTW-1EP0",
                "description": "British Red Cross (July 2024) — critical companion for bite/sting videos; covers anaphylactic shock triggered by insect stings, including adrenaline auto-injector guidance."
            },
            {
                "title": "How to Treat Shock – First Aid Training",
                "youtube_id": "61urGQrmeNM",
                "description": "St John Ambulance UK — covers circulatory shock, which can follow severe bites or anaphylaxis; signs, positioning, and monitoring while awaiting EMS."
            }
        ]
    },
    "flood_safety": {
        "category": "flood_safety",
        "primary": {
            "title": "Flood Safety FEMA PSA",
            "youtube_id": "5P5x-38wp-o",
            "description": "FEMA official PSA (April 2025) — key flood safety actions after a storm: avoid floodwaters, don't drive into submerged roads, and wait for the all-clear."
        },
        "alternatives": [
            {
                "title": "Turn Around Don't Drown PSA",
                "youtube_id": "eI6mIlHKrVY",
                "description": "National Weather Service / NOAA — the flagship flood safety campaign explaining why even 6 inches of moving water can knock an adult off their feet and sweep a car away."
            },
            {
                "title": "FEMA Accessible: Flood Safety and Warning Tips",
                "youtube_id": "7-iYio9UqDQ",
                "description": "FEMA official video (2017) on flood safety and warning vocabulary, with ASL interpretation and multilingual captions. Covers watch vs. warning distinctions."
            }
        ]
    },
    "entrapment_rescue": {
        "category": "entrapment_rescue",
        "primary": {
            "title": "Guideline in Case of Lift Entrapment",
            "youtube_id": "APGiJIm91rw",
            "description": "Safety guidance video on elevator entrapment procedure: stay calm, press the emergency button, use the intercom, and wait for trained rescue personnel. Do not attempt to force doors or climb out."
        },
        "alternatives": [
            {
                "title": "What to Do If You Get Stuck in an Elevator",
                "youtube_id": "oqVWwJd2Sh4",
                "description": "Step-by-step instructional on safe behaviour during elevator entrapment: alert building management, conserve phone battery, avoid prying doors, and signal rescuers."
            },
            {
                "title": "Drop, Cover, and Hold On – Protect Yourself During an Earthquake",
                "youtube_id": "aV89_yUJunM",
                "description": "FEMA / Earthquake Country Alliance (2021) — covers debris entrapment scenarios after structural collapse, including signalling for rescue, covering your mouth, and texting over calling."
            }
        ]
    },
    "fire_evacuation": {
        "category": "fire_evacuation",
        "primary": {
            "title": "How to Make a Home Fire Escape Plan",
            "youtube_id": "tNPb_lKXv6E",
            "description": "NFPA official channel (October 2022, Fire Prevention Week) — explains the two-minute escape window in modern homes, two-exit-per-room planning, meeting points, and practising with family."
        },
        "alternatives": [
            {
                "title": "Every Second Counts in a Home Fire – Practice Your Escape Plan",
                "youtube_id": "Vc-AkbpdSYk",
                "description": "NFPA (2020) — demonstrates how to practice your escape plan, check doors for heat before opening, stay low under smoke, and never re-enter a burning building."
            },
            {
                "title": "NFPA Public Service Announcement – Get Low and Go",
                "youtube_id": "sGgNeYLRgtw",
                "description": "NFPA / Sparky the Fire Dog PSA — concise fire escape rule: stay below smoke, crawl to safety, and get out fast. Suitable for all ages."
            }
        ]
    },
    "extreme_weather": {
        "category": "extreme_weather",
        "primary": {
            "title": "Drop, Cover, and Hold On – Protect Yourself During an Earthquake",
            "youtube_id": "aV89_yUJunM",
            "description": "FEMA / Earthquake Country Alliance (October 2021) — official demonstration of Drop, Cover, and Hold On as the recommended safety action during earthquake shaking."
        },
        "alternatives": [
            {
                "title": "Preparedness: Tornado Safety",
                "youtube_id": "lsOtr-cFdB0",
                "description": "American Red Cross Scientific Advisory Council — Dr. Rick Bissell explains what to do if caught in a tornado: shelter in lowest floor interior room, protect head and neck, avoid windows."
            },
            {
                "title": "ShakeOut Earthquake Drill – Drop Cover and Hold On",
                "youtube_id": "B3mzFRNTZVc",
                "description": "Great ShakeOut / FEMA-supported earthquake drill video (October 2023) — demonstrates Drop, Cover, and Hold On across multiple scenarios including with a service animal."
            }
        ]
    },
    "reassurance_transport": {
        "category": "reassurance_transport",
        "primary": {
            "title": "How to Do the Primary Survey – First Aid Training",
            "youtube_id": "ea1RJUOiNfQ",
            "description": "St John Ambulance UK — the DRABC assessment framework underpins safe patient monitoring while awaiting EMS; includes keeping the patient calm and responsive."
        },
        "alternatives": [
            {
                "title": "How to Treat Shock – First Aid Training",
                "youtube_id": "61urGQrmeNM",
                "description": "St John Ambulance UK — shock management while awaiting ambulance: correct positioning, warmth, reassurance, and monitoring breathing and pulse rate."
            },
            {
                "title": "The Recovery Position – First Aid Training",
                "youtube_id": "GmqXqwSV3bo",
                "description": "St John Ambulance UK — safe positioning for unresponsive breathing patients while awaiting emergency services; essential component of pre-transport patient care."
            }
        ]
    }
}


def get_video_recommendations(category: Optional[str]) -> Dict[str, Any]:
    """
    Returns primary and alternative videos for a given category.
    Defaults to 'reassurance_transport' if the category is invalid or missing.
    """
    cat = category if category in EMERGENCY_VIDEO_CATALOG else "reassurance_transport"
    return EMERGENCY_VIDEO_CATALOG[cat]
