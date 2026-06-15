# CommunityPulse System Architecture

This document describes the design, components, database schemas, and data flow pipelines of CommunityPulse.

---

## 1. Technical Design Overview

CommunityPulse is built using a unified, real-time client-gateway-database design. The primary objective is to maintain instant synchronization across command centers, responders, and reporters during emergency events.

```
       ┌────────────────────────┐         ┌────────────────────────┐
       │   FieldOps Frontend    │         │ Strategic Command Hub │
       └───────────┬────────────┘         └───────────┬────────────┘
                   │                                  │
                   │ (HTTP Rest APIs)                 │ (RTDB Real-time Sync)
                   ▼                                  ▼
         ┌───────────────────┐              ┌───────────────────┐
         │  FastAPI Gateway  ├─────────────►│ Firebase Database │
         └─────────┬─────────┘   (Writes)   └───────────────────┘
                   │
                   │ (Intake / Webhooks)
                   ▼
       ┌────────────────────────┐
       │ WhatsApp / Telegram /  │
       │ Vapi Voice Channels    │
       └────────────────────────┘
```

---

## 2. Component Directory Structure

* **`frontend/`**: Next.js 16 Webpack Client application.
  * **`src/app/`**: Application routing views (strategic command hub, volunteer portal, field operations).
  * **`src/components/`**: Reusable interactive widgets (Map tracking, Authentication, Status tracking).
  * **`src/lib/`**: Firebase integrations, offline DB sync cache engine, and utility functions.
* **`backend/`**: FastAPI high-performance API server.
  * **`main.py`**: API routing endpoints, server middleware setup, rate limiting, and route guards.
  * **`services/`**: Generative AI, notification relays (WhatsApp, Telegram, email), sheets synchronization, and routing.
  * **`tests/`**: Pytest coverage verification files.

---

## 3. Database Schema Design (Firebase RTDB)

The database utilizes Firebase Realtime Database for flat JSON tree layouts to enable rapid reads/writes.

### 3.1. Unified `/needs` Schema
Every report (web form, image upload, WhatsApp message, Telegram text, or WebRTC call) is triaged and saved under `/needs/{need_id}`:
```json
{
  "id": "uuid-string-format",
  "raw_text": "Detailed incident description",
  "description": "Cleaned description summary",
  "need_type": "medical | safety | food | shelter | utilities",
  "ai_heading": "Concise Incident Headline",
  "people_affected": 2,
  "status": "open | in_progress | resolved",
  "source": "web | whatsapp | telegram | voice_agent",
  "recording_url": "https://storage.googleapis.com/... (optional)",
  "caller_phone": "+1234567890 (optional)",
  "urgency_score": 8,
  "emotional_signal": "panicked",
  "tactical_assessment": "Gemini assessment summary",
  "life_threat": true,
  "lat": 12.9716,
  "lng": 77.5946,
  "created_at": 1781433986000,
  "assigned_volunteer_id": "user-uid-string (optional)",
  "assigned_volunteer_name": "Volunteer Name (optional)",
  "notes": "Responder operational notes (optional)"
}
```

### 3.2. Users Schema
Responders and administrators are registered under `/users/{user_uid}`:
```json
{
  "email": "volunteer@communitypulse.org",
  "role": "VOLUNTEER | ADMIN",
  "domain": "human | canine | drone | logistics",
  "created_at": "ISO-8601-timestamp"
}
```

---

## 4. Telemetry and Data Flow Pipelines

### 4.1. Intake Triage Process
1. A user submits a report via Web, WhatsApp, Telegram, or Voice Agent.
2. The FastAPI controller triggers `extract_need_structure` and `score_urgency` using Gemini.
3. If an image is provided, `analyze_field_image` is invoked to refine triage decisions.
4. The backend writes the need to `/needs/{need_id}`.
5. Command hubs listening to Firebase RTDB instantly receive the new incident record.

### 4.2. Dispatch and Acceptance Process
1. A volunteer opens the dashboard and is matched with near coordinates.
2. When the volunteer clicks **Initiate Dispatch**, a POST request is sent to `/needs/{need_id}/accept`.
3. The server locks the record state by setting `status` to `"in_progress"` and saving volunteer metadata.
4. LeafletMap rendering tracks the volunteer's live GPS route to coordinates.

---

## 5. Security Architecture

1. **Secure Access Code Validation:** Invitation codes (`PULSE_ADMIN_1` etc.) are verified server-side only. Client-side builds contain no secret codes.
2. **IP Rate Limiting:** Rate limiting handles brute-force attacks and abuse.
3. **Role Guards:** Administrative and Volunteer endpoints verify Firebase tokens and check role flags before running operations.
