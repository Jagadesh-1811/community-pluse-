# CommunityPulse

**Version:** 1.0.0

Real-time crisis coordination platform enabling rapid response through AI-powered need prioritization and multi-channel communication between field reporters and volunteer coordinators.

---

## Features

**Field Portal** (`/field`): Report needs via text, voice, Telegram, or SMS with real-time location tracking.

**Volunteer Dashboard** (`/volunteer`): AI-powered urgency scoring, interactive mapping, and status management for coordinators.

**Multi-Channel Integration**: Voice agent (Vapi), Telegram bot, email notifications, and SMS support.

**AI Intelligence**: Google Gemini 2.0 Flash for need classification, urgency assessment, and emotional signal detection.

---

## Tech Stack

| Frontend      | Backend      | AI                   | Database     |
| ------------- | ------------ | -------------------- | ------------ |
| Next.js 16    | FastAPI      | Gemini 2.0 Flash     | Firebase     |
| React 19      | Python 3.10+ | Email: Firebase Auth | Telegram API |
| TypeScript    | Uvicorn      | SMS: Available       | Vapi Voice   |
| Tailwind v4   | Pydantic     | Ollama (fallback)    |              |
| React-Leaflet |              |                      |              |

---

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev  # http://localhost:3000
```

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py  # http://localhost:8000
```

### Environment Setup

**Frontend (.env.local)**

```
NEXT_PUBLIC_FIREBASE_API_KEY=<key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project>
NEXT_PUBLIC_FIREBASE_DATABASE_URL=<url>
```

**Backend (.env)**

```
GEMINI_API_KEY=<key>
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase_admin.json
FIREBASE_DATABASE_URL=<url>
VOLUNTEER_ALERT_PHONE=+91XXXXXXXXXX
AI_PROVIDER=gemini
```

---

## API Endpoints

| Method | Endpoint         | Purpose               |
| ------ | ---------------- | --------------------- |
| POST   | `/intake`        | Submit field needs    |
| POST   | `/status/update` | Update mission status |
| POST   | `/notify/vapi`   | Voice agent webhook   |
| GET    | `/health`        | Health check          |

---

## Security

- Email verification for standard users
- 4-digit tactical code for volunteers
- Google OAuth SSO support
- Row-level Firebase security rules
- TLS 1.3 encryption in transit
- No personal data logging

---

## Deployment

### Prerequisites

- Node.js 20+
- Python 3.10+
- Firebase project (RTDB + Auth enabled)
- Google Generative AI API key
- Telegram bot token (optional)
- Vapi account (optional)

### Production Checklist

- [ ] Environment variables configured
- [ ] Firebase security rules deployed
- [ ] CORS origins restricted to production domain
- [ ] SSL/TLS certificates installed
- [ ] Monitoring & error tracking enabled
- [ ] Database backups automated
- [ ] Load testing completed
- [ ] Security audit passed

---

## Documentation

- [Frontend Guide](frontend/README.md) - UI components and setup
- [Backend API](backend/README.md) - API endpoints and services
- [AI Integration](frontend/AGENTS.md) - AI agents and configuration

---

## License

Demonstration and evaluation purposes.

---

For support, refer to component documentation.
