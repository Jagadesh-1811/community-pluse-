import pytest
from unittest.mock import MagicMock
from services.ai_service import (
    generate_message_heading,
    score_urgency,
    extract_need_structure,
    get_video_recommendations,
    _fallback_heading_text,
    AllKeysExhaustedException,
    _pool
)

@pytest.mark.asyncio
async def test_generate_message_heading_success():
    h = await generate_message_heading("I am suffering from heart attack", "reporter")
    assert h == "Heart Attack Emergency"

@pytest.mark.asyncio
async def test_score_urgency_success():
    s = await score_urgency("A pregnant lady is struggling in the park.")
    # In test mocks, score is boosted by multiplier (1.4 for panicked) and life threat (+2)
    # (original_score 8 * multiplier 1.4) + boost 2 = 11 -> min(10, 13) -> 10
    assert s.get("urgency_score") == 10
    assert s.get("emotional_signal") == "panicked"
    assert s.get("life_threat") is True

@pytest.mark.asyncio
async def test_extract_need_structure_success():
    e = await extract_need_structure("Someone is bleeding heavily")
    assert e.get("need_type") == "medical"
    assert e.get("location_name") == "Park"
    assert e.get("emergency_category") == "bleeding"

def test_video_recommendations():
    v = get_video_recommendations("bleeding")
    assert v.get("category") == "bleeding"
    assert v.get("primary", {}).get("youtube_id") == "p9KHec6xfuw"

    v_fallback = get_video_recommendations("nonexistent_category")
    assert v_fallback.get("category") == "reassurance_transport"

def test_fallback_heading_text():
    text = "physically challenged students are stuck in a lift"
    heading = _fallback_heading_text(text, "reporter")
    assert heading == "Physically Challenged Students Are Stuck..."

    empty_heading = _fallback_heading_text("", "reporter")
    assert empty_heading == "Field Report"

@pytest.mark.asyncio
async def test_ai_exhausted_fallback():
    async def mock_exhausted(*args, **kwargs):
        raise AllKeysExhaustedException("Mock quota limits reached.")

    original_call = _pool.call
    _pool.call = MagicMock(side_effect=mock_exhausted)

    try:
        h = await generate_message_heading("physically challenged students are stuck in a lift", "reporter")
        assert h == "Physically Challenged Students Are Stuck..."

        s = await score_urgency("physically challenged students are stuck in a lift")
        assert s.get("urgency_score") == 9
        assert s.get("life_threat") is True

        e = await extract_need_structure("physically challenged students are stuck in a lift")
        assert e.get("emergency_category") == "entrapment_rescue"
    finally:
        _pool.call = original_call
