# CommunityPulse Backend API

**Application Module:** Server-Side Intelligence Engine  
**Framework:** FastAPI (Python)  
**Status:** Production-Ready

---

## Overview

The CommunityPulse backend is a high-performance REST API service providing:

- **Need Intake Processing**: Receiving and analyzing field reports
- **AI Intelligence**: Urgency scoring and need classification
- **Real-time Database**: Firebase integration for persistent storage
- **Multi-channel Communication**: Telegram, Voice, and notification routing
- **Emergency Alerting**: Critical situation detection and volunteer notification

---

## Technical Stack

| Component         | Technology              | Version |
| ----------------- | ----------------------- | ------- |
| Framework         | FastAPI                 | Latest  |
| Web Server        | Uvicorn                 | Latest  |
| Python            | Python                  | 3.10+   |
| AI Model          | Google Gemini 2.0 Flash | Latest  |
| Database          | Firebase Admin SDK      | Latest  |
| Messaging         | Telegram Bot API        | -       |
| Voice Integration | Vapi AI                 | -       |

---

## Project Structure

```
backend/
├── main.py                     # FastAPI application & routes
├── env.py                      # Environment configuration
├── database.py                 # Firebase initialization
├── requirements.txt            # Python dependencies
├── services/
│   ├── ai_service.py          # Gemini AI integration
│   ├── telegram_service.py    # Telegram bot handler
│   ├── voice_service.py       # Voice agent integration
│   └── notif_service.py       # Notification dispatcher
└── .env                        # Environment variables (DO NOT commit)
```

---

## Dependencies

### Core

- **fastapi**: Web framework
- **uvicorn**: ASGI server
- **pydantic**: Data validation
- **python-dotenv**: Environment configuration

### Database & Authentication

- **firebase-admin**: Firebase Admin SDK

### AI & Language Processing

- **google-generativeai**: Gemini API client
- **httpx**: Async HTTP client for Ollama fallback

### External Services

- **python-telegram-bot**: Telegram bot integration
- **jinja2**: Template rendering for notifications

---

## Installation & Setup

### Prerequisites

- Python 3.10 or later
- Firebase project with Realtime Database enabled
- Google Cloud API key for Gemini
- Telegram bot token (optional, for bot features)
- Vapi account (optional, for voice features)

### Installation

```bash
pip install -r requirements.txt
```

### Environment Configuration

Create `.env` file in the backend directory:

```env
# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase_admin.json
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

# AI Configuration
GEMINI_API_KEY=<your_gemini_api_key>
AI_PROVIDER=gemini  # Options: gemini, ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# External Services
TELEGRAM_BOT_TOKEN=<your_telegram_token>
VAPI_API_KEY=<your_vapi_api_key>
VOLUNTEER_ALERT_PHONE=+91XXXXXXXXXX

# Server Configuration
DEBUG=false
ENVIRONMENT=production
```

### Running the Server

**Development**:

```bash
python main.py
```

Server runs on `http://localhost:8000`

**Production with Uvicorn**:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## API Documentation

### Core Endpoints

#### `POST /intake`

Process field need submissions with AI analysis.

**Request**:

```json
{
  "text": "String description of the need",
  "source": "web|voice_agent|telegram",
  "phone": "+91XXXXXXXXXX",
  "lat": 28.6139,
  "lng": 77.209,
  "domain": "human|animal"
}
```

**Response**:

```json
{
  "status": "success",
  "id": "uuid-string",
  "data": {
    "id": "uuid-string",
    "need_type": "food|water|medical|shelter|education|safety|animal",
    "urgency_score": 1-10,
    "emotional_signal": "calm|concerned|distressed|panicked|desperate|grief-stricken|critical"
  }
}
```

**Processing**:

1. AI extracts need structure (type, location, affected count)
2. Urgency scoring with emotional signal detection
3. Record saved to Firebase `/needs/{id}`
4. Critical alerts triggered if urgency ≥ 10
5. Background tasks send notifications

---

#### `POST /status/update`

Update mission status and notify reporters.

**Request**:

```json
{
  "need_id": "uuid-string",
  "status": "open|in_progress|resolved|cancelled"
}
```

**Response**:

```json
{
  "status": "success"
}
```

**Processing**:

1. Update need status in Firebase
2. Retrieve reporter contact information
3. Send status notification via Telegram (if applicable)
4. Log status change for audit trail

---

#### `POST /notify/vapi`

Webhook endpoint for Vapi voice agent call completions.

**Webhook Payload**:

```json
{
  "type": "end-of-call-report",
  "transcript": "Full call transcription",
  "recordingUrl": "https://...",
  "callerPhoneNumber": "+91XXXXXXXXXX",
  "message": {}
}
```

**Processing**:

1. Extract call transcript
2. AI analysis for need structure and urgency
3. Create need record with recording reference
4. Trigger emergency alerts if critical
5. Return success response

---

#### `GET /`

Health check endpoint.

**Response**:

```json
{
  "message": "CommunityPulse API is running"
}
```

---

## Service Modules

### AI Service (`services/ai_service.py`)

#### `extract_need_structure(text: str) -> Dict`

Parses field report using Gemini to extract:

- `need_type`: Classification (food, water, medical, etc.)
- `location_name`: Geographic location description
- `people_affected`: Number of individuals impacted
- `urgency_signal`: Keywords indicating time sensitivity
- `reported_by`: Reporter name if mentioned

#### `score_urgency(raw_text: str) -> Dict`

Comprehensive urgency assessment including:

- `urgency_score`: 1-10 integer rating
- `emotional_signal`: Emotional state classification
- `sentiment_analysis`: Fear, anger, hope, fatigue levels
- `tactical_assessment`: Reasoning for score assignment
- `life_threat`: Boolean critical situation flag

**Multipliers** applied based on emotional state:

- grief-stricken: 1.5x
- critical: 1.7x
- panicked: 1.4x
- desperate: 1.35x
- distressed: 1.25x
- concerned: 1.1x
- calm: 1.0x

#### `generate_tactical_reply(context: str) -> str`

Generate automated response message for reporters.

### Telegram Service (`services/telegram_service.py`)

- Bot message receiving and routing
- Status update message formatting
- Automated response generation

### Voice Service (`services/voice_service.py`)

- Emergency call triggering to volunteer phone
- Call transcription processing
- Voice message formatting

### Notification Service (`services/notif_service.py`)

- Multi-channel notification dispatch
- Template rendering
- Delivery logging

---

## Database Schema

### Firebase Realtime Database Structure

```
root/
├── needs/
│   ├── {need_id}/
│   │   ├── id: string
│   │   ├── raw_text: string
│   │   ├── need_type: string
│   │   ├── domain: "human"|"animal"
│   │   ├── location_name: string
│   │   ├── lat: number
│   │   ├── lng: number
│   │   ├── urgency_score: 1-10
│   │   ├── emotional_signal: string
│   │   ├── status: "open"|"in_progress"|"resolved"|"cancelled"
│   │   ├── source: string
│   │   ├── phone: string
│   │   ├── created_at: timestamp
│   │   └── updated_at: timestamp
```

---

## Error Handling

### HTTP Status Codes

- `200 OK`: Request successful
- `400 Bad Request`: Missing or invalid parameters
- `503 Service Unavailable`: Database not configured

### Error Response Format

```json
{
  "detail": "Error description"
}
```

### Database Connection Errors

The system checks Firebase configuration on startup:

```
[STARTUP] CommunityPulse Intelligence Engine is starting...
[BOT] Telegram Bot: DISABLED (for development)
```

---

## Performance & Scaling

### Async Operations

- FastAPI background tasks for notifications
- Non-blocking database writes
- Concurrent request handling

### Rate Limiting Recommendations

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.post("/intake")
@limiter.limit("100/minute")
async def process_intake(request: IntakeRequest):
    ...
```

### Caching Strategy

- Cache Gemini model initialization
- Cache Firebase connection
- Cache common response templates

### Deployment Sizing

- **Small (dev)**: Single instance, 1GB RAM
- **Medium (production)**: 2-4 instances, 2GB RAM each
- **Large (high-load)**: Auto-scaling with 4GB RAM base

---

## Security Considerations

### API Key Management

- Never commit `.env` file to repository
- Rotate API keys quarterly
- Use different keys for each environment
- Monitor API key usage and quotas

### CORS Configuration

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-frontend-domain.com"],
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)
```

### Input Validation

- All requests validated with Pydantic models
- Request size limits enforced
- SQL injection prevention (using Firebase, not SQL)
- XSS prevention in text processing

### Data Privacy

- No PII logged to standard output
- Secure logging for audit trails
- GDPR compliance for voice recordings
- Encryption in transit (TLS 1.3)

---

## Monitoring & Logging

### Log Output Format

```
[STARTUP] Initialization messages
[BOT] Telegram bot status
[AI] AI operation results
[ERROR] Error conditions
```

### Key Metrics to Monitor

- API response time (target: <500ms)
- Database connection pool usage
- Gemini API quota consumption
- Error rates by endpoint
- Urgent need detection rate

### Health Check Endpoint

```bash
curl http://localhost:8000/
```

---

## Development Guidelines

### Code Style

- Follow PEP 8 guidelines
- Use type hints for all functions
- Include docstrings for public functions
- Keep functions focused and modular

### Testing Recommendations

```bash
# Test with curl
curl -X POST http://localhost:8000/intake \
  -H "Content-Type: application/json" \
  -d '{"text":"Test message","source":"web"}'

# Test locally with Ollama
python -m pytest tests/
```

### Adding New Endpoints

1. Define Pydantic request model
2. Create route function with proper error handling
3. Add background tasks for async operations
4. Include comprehensive documentation
5. Test with both success and error cases

---

## Troubleshooting

### Firebase Connection Issues

```
WARNING: Firebase service account file not found
```

**Solution**: Verify `FIREBASE_SERVICE_ACCOUNT_PATH` and credentials file location

### Gemini API Errors

```
ERROR initializing Gemini: 403 Forbidden
```

**Solution**: Verify API key is valid and has Generative AI API enabled

### Telegram Bot Not Responding

```
ERROR: Telegram Bot Error: ...
```

**Solution**: Verify token in environment, check bot permissions, restart service

---

## Deployment

### Docker Deployment

```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment-Specific Configuration

```bash
# Development
AI_PROVIDER=ollama
DEBUG=true

# Production
AI_PROVIDER=gemini
DEBUG=false
```

### Pre-Production Checklist

- [ ] All environment variables configured
- [ ] Firebase credentials secured
- [ ] API keys rotated and verified
- [ ] CORS origins configured for frontend domain
- [ ] Rate limiting enabled
- [ ] Error monitoring configured
- [ ] Load testing completed
- [ ] Database backup strategy established

---

## Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Firebase Admin SDK](https://firebase.google.com/docs/database/admin/start)
- [Google Generative AI](https://ai.google.dev/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Vapi Documentation](https://vapi.ai/docs)
