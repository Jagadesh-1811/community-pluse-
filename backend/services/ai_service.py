import os
import json
import httpx
import google.generativeai as genai
from typing import Dict, Any
from env import load_backend_env

load_backend_env()

# Configuration
AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini").lower() # 'gemini' or 'ollama'
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Ollama Config
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

# Initialize models - with fallback
extraction_model = None
scoring_model = None

if AI_PROVIDER == "gemini":
    if not GEMINI_API_KEY:
        print("WARNING: GEMINI_API_KEY not found. AI features will be limited.")
    else:
        try:
            genai.configure(api_key=GEMINI_API_KEY)
            # Use gemini-2.0-flash for both - cheaper and more reliable
            extraction_model = genai.GenerativeModel("gemini-2.0-flash")
            scoring_model = genai.GenerativeModel("gemini-2.0-flash")
            print("[AI] Gemini 2.0 Flash models initialized successfully")
        except Exception as e:
            print(f"ERROR initializing Gemini: {e}")
            extraction_model = None
            scoring_model = None

async def _call_gemini(model, prompt: str) -> str:
    response = await model.generate_content_async(prompt)
    return response.text

async def _call_ollama(prompt: str, response_format: str = "json") -> str:
    url = f"{OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False
    }
    
    # Only force JSON if requested
    if response_format == "json":
        payload["format"] = "json"
        
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json().get("response", "")
        except Exception as e:
            print(f"Ollama Proxy Error: {e}")
            raise e

async def extract_need_structure(text: str) -> Dict[str, Any]:
    """Feature 1: Extract structure from field report."""
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
        if AI_PROVIDER == "ollama":
            content = await _call_ollama(prompt)
        elif extraction_model:
            content = await _call_gemini(extraction_model, prompt)
        else:
            print("ERROR: No AI model available for extraction")
            raise Exception("AI extraction model not initialized")
            
        # Cleanup
        content = content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        return json.loads(content)
    except Exception as e:
        print(f"Error in extraction ({AI_PROVIDER}): {e}")
        return {
            "need_type": "safety",
            "location_name": "Unknown",
            "people_affected": None,
            "urgency_signal": "Failed to parse report",
            "reported_by": None
        }

async def score_urgency(raw_text: str) -> Dict[str, Any]:
    """Feature 2: Grief-aware urgency scoring."""
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
        if AI_PROVIDER == "ollama":
            content = await _call_ollama(prompt)
        elif scoring_model:
            content = await _call_gemini(scoring_model, prompt)
        else:
            print("ERROR: No AI model available for scoring")
            raise Exception("AI scoring model not initialized")
            
        # Cleanup
        content = content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        data = json.loads(content)
        
        # Advanced Multiplier Logic (Grief-Aware)
        multipliers = {
            "grief-stricken": 1.5,
            "panicked": 1.4,
            "desperate": 1.35,
            "critical": 1.7,
            "distressed": 1.25,
            "concerned": 1.1,
            "calm": 1.0
        }
        
        original_score = data.get("urgency_score", 5)
        signal = data.get("emotional_signal", "calm")
        multiplier = multipliers.get(signal, 1.0)
        
        # Special Life Threat Boost
        boost = 2 if data.get("life_threat") else 0
        
        final_score = min(10, int((original_score * multiplier) + boost))
        data["urgency_score"] = final_score
        
        return data
    except Exception as e:
        print(f"Error in deep scoring ({AI_PROVIDER}): {e}")
        return {
            "urgency_score": 5,
            "emotional_signal": "concerned",
            "tactical_assessment": "Deep analysis failed. Falling back to default heuristics.",
            "life_threat": False
        }

async def generate_tactical_reply(user_message: str, ai_analysis: Dict[str, Any]) -> str:
    """
    Generates a smart, tactical AI response for the reporter based on their situation.
    """
    prompt = f"""
    [TACTICAL RESPONSE PROTOCOL]
    ROLE: Emergency Intelligence Assistant.
    USER MESSAGE: "{user_message}"
    AI ASSESSMENT: {json.dumps(ai_analysis)}
    
    TASK: Write a 1-sentence tactical instruction for the victim/reporter. 
    - Be calm, professional, and helpful.
    - If it's a medical emergency, give a safety tip.
    - If it's a priority 10 or life_threat=true, tell them a volunteer is being called immediately.
    - Keep it under 160 characters (SMS limit).
    
    REPLY ONLY WITH THE INSTRUCTION TEXT.
    """
    
    try:
        if AI_PROVIDER == "ollama":
            content = await _call_ollama(prompt, response_format="text")
        else:
            # Re-using the scoring model for general intelligence
            content = await _call_gemini(scoring_model, prompt)
            
        return content.strip().strip('"')
    except Exception as e:
        print(f"AI Response Generation Error: {e}")
        return "✅ Report received. Stay safe and wait for further instructions."
