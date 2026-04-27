# CommunityPulse | Intelligent Field Coordination

**Live Deployment:** [Insert Live Link Here]  
**Backend API Endpoint:** `https://community-pulse-api.onrender.com`

CommunityPulse is a high-performance, real-time coordination platform designed for rapid disaster response and tactical volunteer management. Developed by the contributors of the **Sparks Team** for the **Google Solution Build / Google AI Hackathon**, this project demonstrates the powerful integration of Google's Gemini AI models with decentralized operational gateways to bridge the critical gap between on-the-ground field reports and strategic command centers.

## Strategic Overview

During crisis situations, information asymmetry and communication bottlenecks often cost lives. CommunityPulse eliminates these barriers by providing a seamless, multi-channel intake system that automatically categorizes, scores, and dispatches emergencies using advanced Large Language Models. 

The architecture is split into two distinct operational layers:
1. **FieldOps Portal (`/field`)**: A lightweight, highly accessible entry point for victims and on-site reporters to broadcast immediate needs.
2. **Strategic Command Hub (`/volunteer`)**: A secure, high-stakes command center for authorized personnel, featuring real-time tactical telemetry, AI-driven priority intelligence logs, and automated dispatch tracking.

## Core Capabilities & Integrations

### Gemini 2.0 Flash Integration
The platform relies exclusively on **Google Gemini 2.0 Flash** as its core intelligence engine. Every piece of incoming intelligence—whether via text, voice, or Telegram—is instantly processed by Gemini to extract tactical structures (medical, shelter, animal rescue), determine human life-threat levels, and assign a standardized Urgency Score (1-10).

### WebRTC Voice Agent & Outbound Telephony (Vapi)
To ensure accessibility during high-stress scenarios, the system integrates advanced AI Voice capabilities:
- **Web Voice Agent:** Victims can bypass typing entirely and speak directly into their browsers. The audio is transcribed in real-time and passed to Gemini 2.0 Flash, which dynamically converses with the caller to extract mission-critical coordinates and triage data.


### Telegram OSINT Synchronization
Automated intake and status updates are managed via a dedicated Telegram bot (`@CPFieldBot`). This allows field operatives to send encrypted, low-bandwidth reports that are seamlessly ingested, analyzed by Gemini, and synchronized to the global Firebase state.

### Real-time Telemetry & Command UI
- **Firebase Realtime Database (RTDB)**: Powers 100% of the platform's live data flow. Every field report, mission status update, and volunteer movement is synced across the network with zero-latency.
- **Absolute Black Protocol**: The interface is hardened for field use, employing a pure black high-contrast aesthetic to ensure mission IDs and AI-decoded reports are instantly readable in direct sunlight or low-light tactical situations.
- **Secure Tactical Handshake**: Command access requires a dual-gate security system, pairing standard Google OAuth with internal, role-specific clearance codes.

## Technical Architecture

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
