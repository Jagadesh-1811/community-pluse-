import os
import sys
import uuid
import time
import logging

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def seed():
    logger.info("Starting database seeding...")
    db_ref = get_db()
    if not db_ref:
        logger.error("Could not access database. Ensure environment variables are set.")
        sys.exit(1)

    needs_ref = db_ref.child("needs")
    
    mock_needs = [
        {
            "id": str(uuid.uuid4()),
            "raw_text": "Need urgent drinking water and food packets near Block C.",
            "description": "Need urgent drinking water and food packets near Block C.",
            "need_type": "water",
            "domain": "human",
            "location_name": "Block C Sector 5",
            "lat": 28.6139,
            "lng": 77.2090,
            "urgency_score": 7,
            "emotional_signal": "concerned",
            "status": "open",
            "source": "web_portal",
            "created_at": int(time.time() * 1000)
        },
        {
            "id": str(uuid.uuid4()),
            "raw_text": "Stray dog hit by a vehicle and bleeding from front leg.",
            "description": "Stray dog hit by a vehicle and bleeding from front leg.",
            "need_type": "animal",
            "domain": "animal",
            "location_name": "Highway Exit 12",
            "lat": 28.6210,
            "lng": 77.2201,
            "urgency_score": 8,
            "emotional_signal": "panicked",
            "status": "open",
            "source": "telegram_bot",
            "created_at": int(time.time() * 1000)
        }
    ]

    for need in mock_needs:
        needs_ref.child(need["id"]).set(need)
        logger.info(f"Seeded need: {need['need_type']} - {need['id']}")

    logger.info("Database seeding completed successfully.")

if __name__ == "__main__":
    seed()
