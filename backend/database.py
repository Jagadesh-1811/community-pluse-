import firebase_admin
from firebase_admin import credentials, db
from env import BACKEND_DIR, load_backend_env, resolve_backend_path
import os
import json
import logging

load_backend_env()

# Configure logging
logger = logging.getLogger(__name__)

# Firebase Configuration
configured_cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
database_url = os.getenv("FIREBASE_DATABASE_URL")

# Determine credential path for different environments
cred_path = None

# Priority 1: Render secret file (/etc/secrets/)
if configured_cred_path and configured_cred_path.startswith("/etc/secrets/"):
    cred_path = configured_cred_path
# Priority 2: Environment variable path
elif configured_cred_path:
    cred_path = resolve_backend_path(configured_cred_path)
# Priority 3: Fallback to local files
else:
    fallback_credential_paths = [
        BACKEND_DIR / "firebase_admin.json",
        BACKEND_DIR / "firebase-admin.json",
    ]
    cred_path = next(
        (candidate for candidate in fallback_credential_paths if candidate.exists()),
        None,
    )

# Initialize Firebase
if not firebase_admin._apps:
    try:
        if cred_path and os.path.exists(str(cred_path)):
            logger.info(f"Initializing Firebase with credentials from: {cred_path}")
            cred = credentials.Certificate(str(cred_path))
            firebase_admin.initialize_app(cred, {
                'databaseURL': database_url
            })
            logger.info(" Firebase initialized successfully with service account")
        else:
            logger.warning(f"  Firebase service account file not found at {cred_path}. Attempting default credentials...")
            # Try default credentials (for GCP environments)
            try:
                firebase_admin.initialize_app(options={
                    'databaseURL': database_url
                })
                logger.info(" Firebase initialized with default credentials")
            except Exception as e:
                logger.error(f" Failed to initialize Firebase: {e}")
                raise
    except Exception as e:
        logger.error(f" Firebase initialization failed: {e}")
        raise

def get_db():
    """Get Firebase Realtime Database reference."""
    try:
        return db.reference("/")
    except Exception as e:
        logger.error(f" Error accessing Realtime Database: {e}")
        return None
