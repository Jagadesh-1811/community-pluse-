import pytest
from services.ai_service import extract_need_structure, score_urgency, generate_message_heading, get_video_recommendations

@pytest.mark.asyncio
async def test_ai_heading_generation():
    texts = [
        'I am suffering from heart attack',
        'A pregnant lady is struggling in the park. She needs assistance ASAP. She is having internal bleeding.',
        'my area was be flooded',
        'students are stuck in a lift, and all of them are physically challenged in one way or the other, they need assistance',
    ]

    for t in texts:
        h = await generate_message_heading(t, 'reporter')
        s = await score_urgency(t)
        e = await extract_need_structure(t)
        v = get_video_recommendations(e.get("emergency_category"))

        assert h is not None
        assert s.get("urgency_score") is not None
        assert e.get("need_type") is not None
        assert v is not None
