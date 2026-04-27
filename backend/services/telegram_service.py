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

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🛡️ **COMMUNITYPULSE OPERATIONAL RULES** 🛡️\n\n"
        "1. **Accuracy**: Only report real-time field needs.\n"
        "2. **Format**: Use the specific commands below.\n"
        "3. **Tone**: Be clear and descriptive for AI analysis.\n\n"
        "🚀 **COMMAND CENTER CONTROLS**\n"
        "• `/report [desc]` - Human Health Need (Medical/Food/Shelter)\n"
        "• `/animal [desc]` - Animal Health Need (Vet/Rescue)\n"
        "• `/action [msg]` - Log a field update/status\n"
        "• `/status` - Check system connectivity\n\n"
        "Example: `/report 10 people trapped in building sector 4`"
    )

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
    await update.message.reply_text("🔍 Analyzing report via Tactical AI...")

    # AI Analysis Pipeline
    try:
        extracted_data = await extract_need_structure(text)
        scoring_data = await score_urgency(text)
        
        need_type = extracted_data.get("need_type")
        if domain == "animal":
            need_type = "animal"

        # Prepare need record with AI insights
        need_record = {
            "raw_text": text,
            "need_type": need_type,
            "domain": domain,
            "location_name": extracted_data.get("location_name") or "Telegram Report",
            "lat": None,
            "lng": None,
            "urgency_score": scoring_data.get("urgency_score") or 5,
            "emotional_signal": scoring_data.get("emotional_signal"),
            "status": "open",
            "source": "telegram",
            "reporter_name": user.full_name or user.username,
            "telegram_chat_id": update.effective_chat.id,
            "created_at": {".sv": "timestamp"}
        }
        
        ref = db.reference("needs")
        ref.push(need_record)
        
        urgency = need_record["urgency_score"]
        status_msg = "🔴 CRITICAL" if urgency > 7 else "🟠 STABLE" if urgency > 4 else "🟢 LOW"
        
        await update.message.reply_text(
            f" **NEED LOGGED**\n"
            f"━━━━━━━━━━━━━━━\n"
            f" **Domain**: {domain.upper()}\n"
            f" **Type**: {need_type}\n"
            f" **Urgency**: {urgency}/10 ({status_msg})\n"
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
            db.reference("needs").push(fallback_record)
            logger.warning(f"Fallback report saved for {user.username} due to AI analysis failure")
            await update.message.reply_text("⚠️ AI analysis limited, but report saved with default priority.")
        except Exception as db_error:
            logger.error(f"Error saving fallback to Firebase: {str(db_error)}", exc_info=True)
            await update.message.reply_text(
                f"❌ Failed to log need. Backend Firebase error:\n"
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
        needs_ref = db.reference("needs")
        if needs_ref is None:
            logger.error("Firebase needs reference is None")
            await update.message.reply_text("❌ Failed to log action - Backend Firebase not configured. Contact admin.")
            return
        
        needs_ref.push(action_record)
        
        logger.info(f"✅ Action logged via Telegram from {user.username}: {action_text[:50]}...")
        await update.message.reply_text(
            f"✅ **Action Logged to Dashboard**\n"
            f"━━━━━━━━━━━━━━━━━\n"
            f"Message: {action_text}\n"
            f"Status: Visible in Command Center"
        )
    except Exception as e:
        logger.error(f"Error logging telegram action: {str(e)}", exc_info=True)
        await update.message.reply_text(
            f"❌ Failed to log action to dashboard.\n"
            f"Error: {str(e)[:100]}\n\n"
            f"Please ensure backend Firebase is properly configured."
        )

async def run_bot():
    if not TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not found. Telegram bot disabled.")
        logger.warning("To enable: Set TELEGRAM_BOT_TOKEN environment variable on Render")
        return

    logger.info("🤖 Starting Telegram Bot listener...")
    try:
        application = ApplicationBuilder().token(TOKEN).build()
        
        start_handler = CommandHandler('start', start)
        action_handler = CommandHandler('action', log_action)
        report_handler = CommandHandler('report', log_need)
        animal_handler = CommandHandler('animal', log_need)
        location_handler = MessageHandler(filters.LOCATION, handle_location)
        message_handler = MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
        
        application.add_handler(start_handler)
        application.add_handler(action_handler)
        application.add_handler(report_handler)
        application.add_handler(animal_handler)
        application.add_handler(location_handler)
        application.add_handler(message_handler)
        
        await application.initialize()
        await application.start()
        await application.updater.start_polling()
        
        logger.info("✅ Telegram Bot is ACTIVE and listening for commands")
        
        # Keep the bot running
        while True:
            await asyncio.sleep(1)
    except Exception as e:
        logger.error(f"❌ Telegram Bot Error: {str(e)}", exc_info=True)
        raise

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handles normal text messages. If the user has an active need,
    it relays the message to the dashboard chat.
    """
    text = update.message.text
    chat_id = update.effective_chat.id
    
    # Find active need for this chat_id
    needs_ref = db.reference("needs")
    # In a real app, you'd use a query to filter by telegram_chat_id
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
        msg_ref = db.reference(f"messages/{active_need_id}")
        msg_ref.push({
            "need_id": active_need_id,
            "sender": "reporter",
            "text": text,
            "created_at": {".sv": "timestamp"}
        })
        # Optional: Add a small confirmation reaction or message
        # await update.message.reply_text("📤 Relayed to rescue team.")
    else:
        await update.message.reply_text("❓ No active mission found. Use `/report` to start one.")

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
        "status": "open",
        "source": "telegram",
        "reporter_name": user.full_name or user.username,
        "telegram_chat_id": update.effective_chat.id,
        "created_at": {".sv": "timestamp"},
        "urgency_score": 5 # Default for location-only ping
    }
    
    db.reference(f"needs/{need_id}").set(need_record)
    await update.message.reply_text(f"✅ **Location Received!**\nCoordinates: `{lat}, {lng}`\n\nOur team is monitoring this area. Please type a brief description of the emergency.")

if __name__ == "__main__":
    asyncio.run(run_bot())
