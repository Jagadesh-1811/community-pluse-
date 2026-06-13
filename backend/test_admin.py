import sys
sys.path.insert(0, 'd:/community-pluse--main/backend')
from dotenv import load_dotenv
load_dotenv('d:/community-pluse--main/backend/.env')

from main import app
print("FastAPI Backend Compiled Successfully with Admin Endpoint!")
