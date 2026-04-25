import os
import firebase_admin
from firebase_admin import credentials, db
from dotenv import load_dotenv

load_dotenv()

# Path to your service account key file
cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
database_url = os.getenv("FIREBASE_DATABASE_URL")

if not firebase_admin._apps:
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': database_url
        })
    else:
        print(f"WARNING: Firebase service account file not found at {cred_path}. Backend will not be able to write to Firebase.")
        # Alternatively, initialize with default credentials if on GCP
        try:
            firebase_admin.initialize_app(options={
                'databaseURL': database_url
            })
        except:
            pass

def get_db():
    try:
        # Return the root reference for Realtime Database
        return db.reference("/")
    except Exception as e:
        print(f"Error accessing Realtime Database: {e}")
        return None
