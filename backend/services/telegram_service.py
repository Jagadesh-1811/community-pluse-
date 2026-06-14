from uuid import uuid4
import os
import asyncio
import logging
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, filters
from firebase_admin import db
from dotenv import load_dotenv
from services.ai_service import extract_need_structure, score_urgency

load_dotenv()

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
logger = logging.getLogger("telegram_bot")

# Helper function to safely get database reference
def get_needs_ref():
    """Get Firebase needs reference with error handling."""
    try:
        ref = db.reference("needs")
        if ref is None:
            logger.error("Firebase reference returned None - not initialized")
            return None
        return ref
    except Exception as e:
        logger.error(f"Error getting Firebase reference: {str(e)}", exc_info=True)
        return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        " **COMMUNITYPULSE OPERATIONAL RULES** \n\n"
        "1. **Accuracy**: Only report real-time field needs.\n"
        "2. **Format**: Use the specific commands below.\n"
        "3. **Tone**: Be clear and descriptive for AI analysis.\n\n"
        " **COMMAND CENTER CONTROLS**\n"
        "• `/report [desc]` - Human Health Need (Medical/Food/Shelter)\n"
        "• `/animal [desc]` - Animal Health Need (Vet/Rescue)\n"
        "• `/action [msg]` - Log a field update/status\n"
        "• `/accept [need_id]` - Accept mission status\n"
        "• `/resolve [need_id]` - Mark mission resolved\n"
        "• `/status` - Check system connectivity\n\n"
        "Example: `/report 10 people trapped in building sector 4`"
    )

async def accept_need(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage: /accept [incident_id]")
        return
    incident_id = context.args[0]
    try:
        need_ref = db.reference(f"needs/{incident_id}")
        need = need_ref.get()
        if not need:
            await update.message.reply_text(f" Incident ID `{incident_id}` not found.")
            return
        
        need_ref.update({"status": "in-progress"})
        await update.message.reply_text(f" Mission accepted for Incident ID `{incident_id}`. Status set to IN-PROGRESS.")
        
        # Log to message feed
        db.reference(f"messages/{incident_id}").push({
            "need_id": incident_id,
            "type": "telegram_update",
            "body": f"Volunteer accepted incident via Telegram bot command.",
            "status": "sent",
            "created_at": {".sv": "timestamp"}
        })
    except Exception as e:
        logger.error(f"Error accepting need in Telegram: {e}")
        await update.message.reply_text(f" Error updating incident: {str(e)}")

async def resolve_need(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage: /resolve [incident_id]")
        return
    incident_id = context.args[0]
    try:
        need_ref = db.reference(f"needs/{incident_id}")
        need = need_ref.get()
        if not need:
            await update.message.reply_text(f" Incident ID `{incident_id}` not found.")
            return
        
        need_ref.update({"status": "resolved"})
        await update.message.reply_text(f" Mission resolved for Incident ID `{incident_id}`. Status set to RESOLVED.")
        
        # Log to message feed
        db.reference(f"messages/{incident_id}").push({
            "need_id": incident_id,
            "type": "telegram_update",
            "body": f"Volunteer marked incident as resolved via Telegram bot command.",
            "status": "sent",
            "created_at": {".sv": "timestamp"}
        })
    except Exception as e:
        logger.error(f"Error resolving need in Telegram: {e}")
        await update.message.reply_text(f" Error updating incident: {str(e)}")

async def log_need(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage: /report [your message here]")
        return

    text = " ".join(context.args)
    user = update.effective_user
    
    # Determine domain based on command
    command = update.message.text.split()[0].lower()
    domain = "animal" if "/animal" in command else "human"
    
    # Notify user that analysis is starting
    await update.message.reply_text(" Analyzing report via Tactical AI...")

    # AI Analysis Pipeline
    try:
        logger.info(f" Starting AI analysis for Telegram report: {text[:100]}...")
        extracted_data = await extract_need_structure(text)
        logger.info(f" Need structure extracted: {extracted_data}")
        
        scoring_data = await score_urgency(text)
        logger.info(f" Urgency scoring complete: Score={scoring_data.get('urgency_score')}, Signal={scoring_data.get('emotional_signal')}")
        
        need_type = extracted_data.get("need_type")
        if domain == "animal":
            need_type = "animal"

        # Prepare need record with AI insights
        urgency_score = scoring_data.get("urgency_score", 5)
        
        need_record = {
            "raw_text": text,
            "need_type": need_type,
            "domain": domain,
            "location_name": extracted_data.get("location_name") or "Telegram Report",
            "lat": None,
            "lng": None,
            "urgency_score": urgency_score,
            "emotional_signal": scoring_data.get("emotional_signal"),
            "tactical_assessment": scoring_data.get("tactical_assessment"),
            "life_threat": scoring_data.get("life_threat", False),
            "status": "open",
            "source": "telegram",
            "reporter_name": user.full_name or user.username or "Unknown",
            "telegram_chat_id": update.effective_chat.id,
            "created_at": {".sv": "timestamp"}
        }
        
        # Push to Firebase
        needs_ref = get_needs_ref()
        if needs_ref is None:
            logger.error("Cannot get Firebase reference - Firebase may not be initialized")
            await update.message.reply_text(
                " Failed to log report - Backend Firebase not configured.\n"
                "Please contact admin. Backend needs TELEGRAM_BOT_TOKEN and Firebase credentials."
            )
            return
        
        needs_ref.push(need_record)
        logger.info(f" Telegram need saved with urgency score: {urgency_score}/10")
        
        status_msg = " CRITICAL" if urgency_score > 7 else " STABLE" if urgency_score > 4 else " LOW"
        
        await update.message.reply_text(
            f" **NEED LOGGED**\n"
            f"━━━━━━━━━━━━━━━\n"
            f" **Domain**: {domain.upper()}\n"
            f" **Type**: {need_type}\n"
            f" **Urgency**: {urgency_score}/10 ({status_msg})\n"
            f" **AI Signal**: {need_record['emotional_signal']}\n"
            f"━━━━━━━━━━━━━━━\n"
            f"Visible on Command Center Priority Queue."
        )
    except Exception as e:
        logger.error(f"Error in Telegram pipeline: {str(e)}", exc_info=True)
        # Fallback: save with defaults even if AI fails
        try:
            fallback_record = {
                "raw_text": text,
                "need_type": "animal" if domain == "animal" else "medical",
                "domain": domain,
                "urgency_score": 5,
                "status": "open",
                "source": "telegram",
                "reporter_name": user.full_name or user.username or "Unknown",
                "telegram_chat_id": update.effective_chat.id,
                "created_at": {".sv": "timestamp"}
            }
            needs_ref = get_needs_ref()
            if needs_ref is None:
                logger.error("Cannot save fallback - Firebase not initialized")
                await update.message.reply_text(
                    " Failed to save report. Backend Firebase not initialized.\n"
                    "Contact admin - check FIREBASE_SERVICE_ACCOUNT_PATH and FIREBASE_DATABASE_URL"
                )
                return
            
            needs_ref.push(fallback_record)
            logger.warning(f" Fallback report saved for {user.username} due to AI analysis failure")
            await update.message.reply_text(" AI analysis limited, but report saved with default priority.")
        except Exception as db_error:
            logger.error(f"Error saving fallback to Firebase: {str(db_error)}", exc_info=True)
            await update.message.reply_text(
                f" Failed to log need. Backend Firebase error:\n"
                f"{str(db_error)[:100]}\n\n"
                f"Contact admin or check backend configuration."
            )

async def log_action(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage: /action [your message here]")
        return

    action_text = " ".join(context.args)
    user = update.effective_user
    
    # Prepare action record as a need entry with 'action' type
    action_record = {
        "raw_text": action_text,
        "need_type": "action",
        "domain": "action",
        "status": "logged",
        "source": "telegram",
        "reporter_name": user.full_name or user.username or "Unknown",
        "telegram_chat_id": update.effective_chat.id,
        "created_at": {".sv": "timestamp"},
        "urgency_score": 3  # Low priority for actions
    }
    
    try:
        # Push to Firebase 'needs' path so it appears in dashboard
        needs_ref = get_needs_ref()
        if needs_ref is None:
            logger.error("Cannot get Firebase reference - Firebase may not be initialized")
            await update.message.reply_text(
                " Failed to log action - Backend Firebase not configured.\n"
                "Please contact admin to check backend deployment."
            )
            return
        
        needs_ref.push(action_record)
        
        logger.info(f" Action logged via Telegram from {user.username}: {action_text[:50]}...")
        await update.message.reply_text(
            f" **Action Logged to Dashboard**\n"
            f"━━━━━━━━━━━━━━━━━\n"
            f"Message: {action_text}\n"
            f"Status: Visible in Command Center"
        )
    except Exception as e:
        logger.error(f"Error logging telegram action: {str(e)}", exc_info=True)
        await update.message.reply_text(
            f" Failed to log action to dashboard.\n"
            f"Error: {str(e)[:100]}"
        )

async def run_bot():
    if not TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not found. Telegram bot disabled.")
        logger.warning("To enable: Set TELEGRAM_BOT_TOKEN environment variable on Render")
        return

    logger.info(" Starting Telegram Bot listener...")
    try:
        application = ApplicationBuilder().token(TOKEN).build()
        
        start_handler = CommandHandler('start', start)
        action_handler = CommandHandler('action', log_action)
        report_handler = CommandHandler('report', log_need)
        animal_handler = CommandHandler('animal', log_need)
        accept_handler = CommandHandler('accept', accept_need)
        resolve_handler = CommandHandler('resolve', resolve_need)
        location_handler = MessageHandler(filters.LOCATION, handle_location)
        message_handler = MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
        
        application.add_handler(start_handler)
        application.add_handler(action_handler)
        application.add_handler(report_handler)
        application.add_handler(animal_handler)
        application.add_handler(accept_handler)
        application.add_handler(resolve_handler)
        application.add_handler(location_handler)
        application.add_handler(message_handler)
        
        await application.initialize()
        await application.start()
        await application.updater.start_polling()
        
        logger.info(" Telegram Bot is ACTIVE and listening for commands")
        
        # Keep the bot running
        while True:
            await asyncio.sleep(1)
    except Exception as e:
        logger.error(f" Telegram Bot Error: {str(e)}", exc_info=True)
        raise

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handles normal text messages. If the user has an active need,
    it relays the message to the dashboard chat.
    """
    text = update.message.text
    chat_id = update.effective_chat.id
    
    # Find active need for this chat_id
    needs_ref = get_needs_ref()
    if needs_ref is None:
        logger.warning(f"Cannot handle message - Firebase not initialized for chat {chat_id}")
        await update.message.reply_text(" Backend connection issue. Please try again later.")
        return
    
    snapshot = needs_ref.get()
    
    active_need_id = None
    if snapshot:
        # Filter for open needs for this user
        user_needs = [
            (k, v) for k, v in snapshot.items() 
            if v.get("telegram_chat_id") == chat_id and v.get("status") != "resolved"
        ]
        if user_needs:
            # Sort by created_at (mock sort using key order if timestamp missing)
            active_need_id = user_needs[-1][0]

    if active_need_id:
        # Log to Firebase Chat
        try:
            msg_ref = db.reference(f"messages/{active_need_id}")
            if msg_ref is None:
                logger.warning(f"Cannot log message - Firebase reference is None")
                return
            
            msg_ref.push({
                "need_id": active_need_id,
                "sender": "reporter",
                "text": text,
                "created_at": {".sv": "timestamp"}
            })
        except Exception as e:
            logger.error(f"Error logging message to Firebase: {str(e)}", exc_info=True)
    else:
        await update.message.reply_text(" No active mission found. Use `/report` to start one.")

async def send_telegram_message(chat_id: int, text: str):
    """
    Sends a message to a specific Telegram chat.
    Used for status updates and chat relay.
    """
    if not TOKEN:
        return
    application = ApplicationBuilder().token(TOKEN).build()
    await application.bot.send_message(chat_id=chat_id, text=text, parse_mode='Markdown')

async def handle_location(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handles native Telegram location sharing.
    """
    user_location = update.message.location
    lat, lng = user_location.latitude, user_location.longitude
    user = update.effective_user
    
    # Log this as a high-precision GPS report
    need_id = str(uuid4())
    need_record = {
        "id": need_id,
        "description": "GPS Location Shared via Telegram",
        "latitude": lat,
        "longitude": lng,
        "lat": lat,
        "lng": lng,
        "status": "open",
        "source": "telegram",
        "reporter_name": user.full_name or user.username or "Unknown",
        "telegram_chat_id": update.effective_chat.id,
        "created_at": {".sv": "timestamp"},
        "urgency_score": 5 # Default for location-only ping
    }
    
    try:
        needs_ref = get_needs_ref()
        if needs_ref is None:
            logger.error("Cannot save location - Firebase not initialized")
            await update.message.reply_text(" Failed to save location - Backend Firebase not configured.")
            return
        
        needs_ref.child(need_id).set(need_record)
        logger.info(f" Location saved from {user.username}: ({lat}, {lng})")
        await update.message.reply_text(f" **Location Received!**\nCoordinates: `{lat}, {lng}`\n\nOur team is monitoring this area. Please type a brief description of the emergency.")
    except Exception as e:
        logger.error(f"Error saving location: {str(e)}", exc_info=True)
        await update.message.reply_text(f" Failed to save location.\nError: {str(e)[:100]}")

if __name__ == "__main__":
    asyncio.run(run_bot())
