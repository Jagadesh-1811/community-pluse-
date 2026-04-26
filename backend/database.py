import firebase_admin
from firebase_admin import credentials, db
from env import BACKEND_DIR, load_backend_env, resolve_backend_path

load_backend_env()

# Path to your service account key file
import os


configured_cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
cred_path = resolve_backend_path(configured_cred_path)
database_url = os.getenv("FIREBASE_DATABASE_URL")

if cred_path and not cred_path.exists():
    fallback_credential_paths = [
        BACKEND_DIR / "firebase_admin.json",
        BACKEND_DIR / "firebase-admin.json",
    ]
    cred_path = next(
        (candidate for candidate in fallback_credential_paths if candidate.exists()),
        cred_path,
    )

if not firebase_admin._apps:
    if cred_path and cred_path.exists():
        cred = credentials.Certificate(str(cred_path))
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
