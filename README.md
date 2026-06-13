# CommunityPulse | Intelligent Field Coordination

**Live Deployment:** https://community-pluse.vercel.app/  
**Backend API Endpoint:** `https://community-pulse-api.onrender.com`

CommunityPulse is a high-performance, real-time coordination platform designed for rapid disaster response and tactical volunteer management. Developed by the contributors of the **Sparks Team** for the **Google Solution Build / Google AI Hackathon**, this project demonstrates the powerful integration of Google's Gemini AI models with decentralized operational gateways to bridge the critical gap between on-the-ground field reports and strategic command centers.

## Strategic Overview

During crisis situations, information asymmetry and communication bottlenecks often cost lives. CommunityPulse eliminates these barriers by providing a seamless, multi-channel intake system that automatically categorizes, scores, and dispatches emergencies using advanced Large Language Models. 

The architecture is split into two distinct operational layers:
1. **FieldOps Portal (`/field`)**: A lightweight, highly accessible entry point for victims and on-site reporters to broadcast immediate needs.
2. **Strategic Command Hub (`/volunteer`)**: A secure, high-stakes command center for authorized personnel, featuring real-time tactical telemetry, AI-driven priority intelligence logs, and automated dispatch tracking.

## Core Capabilities & Integrations

### Gemini 2.0 / 2.5 Flash Integration (Text & Multimodal Vision)
The platform relies on **Google Gemini Flash** as its core intelligence engine. Every piece of incoming intelligence is instantly processed:
- **Triage & Classification**: Automatically extracts categories (medical, shelter, animal rescue), identifies life safety threats, and determines urgency.
- **Multimodal Visual Intake (New)**: Field operators can upload images directly from the Web intake portal. Gemini Vision analyzes the incident photo to spot visual hazards (e.g. fire, flooding, blockages) and dynamically enhances the urgency score (e.g., boosting it to 9/10 if high-risk visual signals are detected).
- **Fallback Keyword Engine**: Equipped with a backup rule-based keyword heuristic that steps in automatically if the Gemini API cap or project quotas are exhausted, ensuring reliable, prioritized triage at all times.

### AI-Driven Incident Clustering (New)
* **Spatial & Temporal Grouping**: When 5+ reports are received from the same 2km radius within a 10-minute window, the system automatically groups them into a single major incident cluster to deduplicate data.
* **Coordinated Dispatch Alert**: Sends a single consolidated dispatch card to volunteers instead of multiple separate notifications, reducing notification fatigue.

### Autonomous SLA Severity Escalation (New)
* **Autonomous Cron Loop**: A background process monitors needs in real-time. If any active report remains in "open" status for more than 5 minutes without volunteer acceptance, the AI:
  1. Escalates the urgency score (+2 points, capped at 10).
  2. Expands the volunteer search radius by `+5km` (from 10km to 15km).
  3. Re-dispatches the coordinate telemetry alert to notify the next outer ring of volunteers.

### Intelligent Volunteer Recommendation (Google Routes API)
- **Traffic-Aware Dispatch**: The dispatcher panel queries the Google Routes API to calculate exact distances and real-time, traffic-aware travel durations for all available volunteers relative to the incident.
- **Gemini Selector Reasoning**: Passes the telemetry, sector match capabilities, and travel times to Gemini to choose the optimal volunteer and generate dispatcher justification notes.

### WebRTC Voice Agent & Outbound Telephony (Vapi)
To ensure accessibility during high-stress scenarios, the system integrates advanced AI Voice capabilities:
- **Web Voice Agent:** Victims can bypass typing entirely and speak directly into their browsers. The audio is transcribed in real-time and passed to Gemini, which dynamically converses with the caller to extract mission-critical coordinates and triage data.
- **Outbound Voice Hotlines**: Highly critical incidents (urgency 10/10) trigger automated phone calls to volunteers using a pre-configured Vapi emergency pipeline to verbally broadcast details and coordinates.

### Real-time Google Sheets Auto-Export
- **Live Dispatch Sync**: A background listener is bound directly to the Firebase database path. Whenever an incident state updates (e.g. status changes from "open" to "accepted" or "resolved"), the backend automatically appends the detailed telemetry data to a Google Sheets dashboard.
- **Service Account Link**: The sheet requires sharing with the project's Firebase Service Account client email:
  ```
  firebase-adminsdk-fbsvc@commuintypluse.iam.gserviceaccount.com
  ```

### Outbound Gmail SMTP Commissioning
- **Secure Credentials Dispatch**: Admin panel registration dynamically generates secure credentials, passwords, sector domains, and capability categories, emailing them directly to volunteers using SMTP relay with responsive HTML templates.

### Meta WhatsApp Intake Gateway
- **Meta Graph Integration**: Integrates directly with the Meta Cloud Graph API. Incidents sent via WhatsApp are automatically triaged by the backend AI, classified into domains, scored, and synced to Firebase.
- **Auto-Reply Status Confirms**: Instantly replies to the WhatsApp reporter with a structured operational confirmation containing their Incident ID, classification, and safety instructions.

### Telegram OSINT Synchronization
Automated intake and status updates are managed via a dedicated Telegram bot (`@CPFieldBot`). This allows field operatives to send encrypted, low-bandwidth reports that are seamlessly ingested, analyzed by Gemini, and synchronized to the global Firebase state.

### Real-time Telemetry & Command UI
- **Firebase Realtime Database (RTDB)**: Powers 100% of the platform's live data flow. Every field report, mission status update, and volunteer movement is synced across the network with zero-latency.
- **Volunteer Capability Filtering**: The volunteer command hub automatically filters the live report alert stream based on the logged-in volunteer's assigned categories (e.g. food, water, medical) to keep dispatches highly targeted.
- **Audit Logging & Live Communications Feed**: Outbound dispatches and status updates trigger structured logs written to the database `/messages/` collection, instantly populating the **Comms Hub** tab.
- **Absolute Black Protocol**: The interface is hardened for field use, employing a pure black high-contrast aesthetic to ensure mission IDs and AI-decoded reports are instantly readable in direct sunlight or low-light tactical situations.
- **Secure Tactical Handshake**: Command access requires a dual-gate security system, pairing standard Google OAuth with internal, role-specific clearance codes.

## Technical Architecture

```mermaid
graph TD
    %% Style Definitions
    classDef client fill:#111,stroke:#007acc,stroke-width:2px,color:#fff;
    classDef backend fill:#111,stroke:#39b54a,stroke-width:2px,color:#fff;
    classDef external fill:#111,stroke:#f15a24,stroke-width:2px,color:#fff;
    classDef db fill:#111,stroke:#ffcc00,stroke-width:2px,color:#fff;

    subgraph Clients ["Client Layer (Field & Operations)"]
        A[FieldOps Portal /field]:::client
        B[Strategic Command Hub /volunteer]:::client
        C[WhatsApp Intake Client]:::client
        D[Telegram Bot @CPFieldBot]:::client
    end

    subgraph Backend ["Backend Intelligence Layer (FastAPI)"]
        F[FastAPI Server main.py]:::backend
        G[AI Service ai_service.py]:::backend
        H[Telegram Service telegram_service.py]:::backend
        I[Voice Service voice_service.py]:::backend
        J[Email Service email_service.py]:::backend
        K[Sheets Service sheets_service.py]:::backend
        L[Autonomous SLA Cron Loop]:::backend
    end

    subgraph External ["External Services & Infrastructure"]
        M[(Firebase Realtime DB)]:::db
        N[Google Gemini 2.0 Flash API]:::external
        O[Vapi AI WebRTC/Telephony]:::external
        P[Meta Cloud Graph API]:::external
        Q[Google Routes API]:::external
        R[Google Sheets API]:::external
        S[SMTP Relay Service]:::external
    end

    %% Flows
    A -->|1. Web Report Intake & Images| F
    A -.->|2. WebRTC Voice Stream| O
    B -->|3. Volunteer Recommender Query| F
    C -->|4. Incoming Message Hook| F
    D -->|5. Message updates| H
    
    H -->|Process text| G
    F -->|Triage & Vision Analysis| G
    G -->|Triage, Image Triage, & Clustering| N
    
    %% Data Persistence
    F -->|Write Needs & Telemetry| M
    M -->|Real-time Feed Push| B
    M -->|Real-time Change Listener| K
    K -->|Append Incident| R

    %% Integrations & Dispatch
    F -->|Trigger Outbound Call (Urgency 10)| I
    I -->|Outbound Webhook| O
    F -->|Traffic-Aware Selector Routing| Q
    F -->|SMTP Email Commissioning| J
    J -->|SMTP TLS Send| S
    
    %% SLA Loop
    L -->|Scan Open Incidents > 5 min| M
    L -->|Escalate Urgency +2 & Radius +5km| G
```

### Frontend Layer
- **Framework**: Next.js 16 (Turbopack)
- **Styling**: Vanilla CSS + Tailwind CSS v4
- **State & Auth**: Firebase Auth, Firebase RTDB
- **Geospatial Mapping**: React-Leaflet (Leaflet.js)
- **Voice Integration**: Vapi Web SDK
- **API Connectivity**: Dynamic Routing via `NEXT_PUBLIC_API_URL`

### Backend Layer
- **Framework**: FastAPI (Python)
- **Intelligence Engine**: Google Gemini 2.0 Flash (via `google.genai`)
- **Telephony / WebRTC**: Vapi AI REST API
- **Database Operations**: Firebase Admin SDK

## Local Development Initialization

### 1. Environment Configuration
You must configure the `.env` variables for both directories before starting. 

**Frontend (`frontend/.env`)**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000 # Or your deployed backend URL
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_VAPI_PUBLIC_KEY=...
```

**Backend (`backend/.env`)**
```env
GEMINI_API_KEY=...
VAPI_API_KEY=...
FIREBASE_SERVICE_ACCOUNT_JSON=...
```

### 2. Frontend Initialization
Navigate to the `frontend` directory, install dependencies, and start the Next.js server.
```bash
cd frontend
npm install
npm run dev
```

### 3. Backend Initialization
Navigate to the `backend` directory, instantiate a virtual environment, install requirements, and execute the FastAPI server.
```bash
cd backend
python -m venv venv

# Windows Activation
.\venv\Scripts\Activate
# POSIX Activation
source venv/bin/activate

pip install -r requirements.txt
python main.py
```

## Acknowledgments
Developed and maintained by the contributors of the **Sparks Team** as a submission for the **Google Solution Build** and **Google AI Hackathon**.
