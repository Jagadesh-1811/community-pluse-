import os
import json
import httpx
import google.generativeai as genai
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv()

# Configuration
AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini").lower() # 'gemini' or 'ollama'
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Ollama Config
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

# Initialize Gemini if selected
if AI_PROVIDER == "gemini":
    if not GEMINI_API_KEY:
        print("WARNING: GEMINI_API_KEY not found. AI features will be limited.")
    else:
        genai.configure(api_key=GEMINI_API_KEY)
        # Models
        extraction_model = genai.GenerativeModel("gemini-2.0-flash-lite")
        scoring_model = genai.GenerativeModel("gemini-1.5-flash")

async def _call_gemini(model, prompt: str) -> str:
    response = await model.generate_content_async(prompt)
    return response.text

async def _call_ollama(prompt: str) -> str:
    url = f"{OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json"
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json().get("response", "")
        except Exception as e:
            print(f"Ollama error: {e}")
            raise e

async def extract_need_structure(text: str) -> Dict[str, Any]:
    """Feature 1: Extract structure from field report."""
    prompt = f"""Extract from this field report and return ONLY valid JSON:
{{
    "need_type": "food"|"water"|"medical"|"shelter"|"education"|"safety",
    "location_name": "string",
    "people_affected": number or null,
    "urgency_signal": "any emotional or time-sensitive language found",
    "reported_by": "name if mentioned or null"
}}
Field report: {text}"""
    
    try:
        if AI_PROVIDER == "ollama":
            content = await _call_ollama(prompt)
        else:
            content = await _call_gemini(extraction_model, prompt)
            
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
    prompt = f"""Read this field report and return ONLY valid JSON:
{{
  "urgency_score": integer 1-10 based on severity + people affected + time sensitivity,
  "emotional_signal": "calm"|"concerned"|"desperate"|"critical",
  "reasoning": "one sentence"
}}
Field report: {raw_text}"""
    
    try:
        if AI_PROVIDER == "ollama":
            content = await _call_ollama(prompt)
        else:
            content = await _call_gemini(scoring_model, prompt)
            
        # Cleanup
        content = content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        data = json.loads(content)
        
        # Apply multipliers as per Feature 2
        multipliers = {
            "desperate": 1.4,
            "critical": 1.6,
            "concerned": 1.2,
            "calm": 1.0
        }
        
        original_score = data.get("urgency_score", 5)
        signal = data.get("emotional_signal", "calm")
        multiplier = multipliers.get(signal, 1.0)
        
        final_score = min(10, int(original_score * multiplier))
        data["urgency_score"] = final_score
        
        return data
    except Exception as e:
        print(f"Error in scoring ({AI_PROVIDER}): {e}")
        return {
            "urgency_score": 5,
            "emotional_signal": "concerned",
            "reasoning": "Automated scoring failed, default applied."
        }
