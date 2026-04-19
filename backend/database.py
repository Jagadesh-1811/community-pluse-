import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.getenv("SUPABASE_URL", "https://placeholder.supabase.co")
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "placeholder-key")

if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
    print("WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found. Database functionality will be limited.")
    supabase = None # Still initialize to None but don't crash if the logic handles it
else:
    supabase: Client = create_client(url, key)


def get_db():
    return supabase
