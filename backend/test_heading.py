import sys, asyncio
sys.path.insert(0, 'd:/community-pluse--main/backend')
from dotenv import load_dotenv
load_dotenv('d:/community-pluse--main/backend/.env')
from services.ai_service import extract_need_structure, score_urgency, generate_message_heading

texts = [
    'I am suffering from heart attack',
    'A pregnant lady is struggling in the park. She needs assistance ASAP. She is having internal bleeding.',
    'adhsons',
    'adda',
]

async def test():
    for t in texts:
        h = await generate_message_heading(t, 'reporter')
        s = await score_urgency(t)
        e = await extract_need_structure(t)
        print(f'MSG: "{t[:50]}"')
        print(f'  Heading : {h}')
        print(f'  Score   : {s.get("urgency_score")} | {s.get("emotional_signal")}')
        print(f'  Location: {e.get("location_name")} | Type: {e.get("need_type")}')
        print()

asyncio.run(test())
