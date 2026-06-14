import sys
import os
import pytest
from unittest.mock import MagicMock

# Inject backend path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

# Set up mock environment variables before importing main app
os.environ["ENVIRONMENT"] = "testing"
os.environ["VOLUNTEER_CODES"] = "TEST_CODE_1,TEST_CODE_2"
os.environ["GEMINI_API_KEY"] = "mock_key_1"
os.environ["GEMINI_API_KEY_2"] = "mock_key_2"
os.environ["GEMINI_API_KEY_3"] = "mock_key_3"
os.environ["FIREBASE_DATABASE_URL"] = "https://mock-rtdb.firebaseio.com/"

# Mock firebase_admin before imports to avoid connection errors
import firebase_admin
from firebase_admin import db, auth

# Mock firebase_admin initialize_app
firebase_admin.initialize_app = MagicMock()
firebase_admin._apps = {"[default]": MagicMock()}

# Mock DB references
mock_db_ref = MagicMock()
db.reference = MagicMock(return_value=mock_db_ref)

# Mock get_db
import database
database.get_db = MagicMock(return_value=mock_db_ref)

# Mock services
import services.ai_service
from services.ai_service import _pool

# Mock Gemini calls
async def mock_call(model_name: str, prompt: str) -> str:
    prompt_lower = prompt.lower()
    if "tactical response protocol" in prompt_lower:
        return "Tactical mock advice."
    elif "extract from this field report" in prompt_lower:
        return '{"need_type": "medical", "location_name": "Park", "people_affected": 2, "urgency_signal": "hurry", "emergency_category": "bleeding"}'
    elif "tactical intelligence protocol" in prompt_lower:
        return '{"urgency_score": 8, "emotional_signal": "panicked", "sentiment_analysis": {"fear_level": 8, "anger_level": 3, "hope_level": 5, "fatigue_level": 6}, "tactical_assessment": "Severe injury", "life_threat": true}'
    elif "tactical vision analysis protocol" in prompt_lower:
        return '{"visual_severity": "high", "visual_hazards": ["fire"], "verified_urgency_score": 9, "vision_assessment": "Spotted flame"}'
    elif "you are labelling messages" in prompt_lower:
        if "heart attack" in prompt_lower:
            return "Heart Attack Emergency"
        return "Test Heading Text"
    return "mock completion"

_pool.call = MagicMock(side_effect=mock_call)

@pytest.fixture(autouse=True)
def cleanup_mock_db():
    mock_db_ref.reset_mock()
    mock_db_ref.get.return_value = {}
    mock_db_ref.child.return_value = mock_db_ref
    yield
