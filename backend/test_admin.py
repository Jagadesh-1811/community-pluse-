import sys
import os
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)
from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, '.env'))

from main import app
print("FastAPI Backend Compiled Successfully with Admin Endpoint!")
