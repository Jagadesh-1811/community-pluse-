# CommunityPulse | Intelligent Field Coordination

CommunityPulse is a high-performance, real-time coordination platform designed for rapid response and tactical volunteer management. It provides a seamless link between field reports and strategic command, powered by AI intelligence and decentralized operational gateways.

## 🚀 Key Features

### 📡 Decentralized Tactical Gateways
- **FieldOps Portal (`/field`)**: A dedicated entry point for reporters (users) with integrated "Broadcast Protocol" for immediate need submissions and status tracking.
- **Strategic Command Hub (`/volunteer`)**: A high-stakes command center for authorized volunteers, featuring real-time tactical telemetry, priority intelligence logs, and automated dispatch alerts.
- **Secure Tactical Handshake**: Volunteer access is strictly gated via **4-Digit Tactical Codes**. Only authorized personnel can commission volunteer-level clearance.

### 🛡️ Verified Authentication Protocol
- **Verified Sign-In**: Mandatory email verification for all standard accounts to ensure operator authenticity.
- **Integrated Gmail Auth**: Seamless Google authentication for all roles, with role-specific code verification for volunteers.
- **Absolute Black Aesthetic**: High-contrast, premium UI optimized for clarity in high-stress field environments.

### 🔥 Real-time Firebase Sync
- **Firebase Realtime Database (RTDB)**: Powering 100% of the platform's live data flow. Every field report, mission status update, and volunteer movement is synced across the network with zero-latency.
- **Satellite Synchronization**: Decentralized data nodes ensure that command hubs and field units are always in lock-step.

### 🧠 AI & Real-time Intelligence
- **Urgency Engine**: Powered exclusively by **Gemini 2.0 Flash** for high-speed urgency scoring of incoming transmissions.
- **Tactical Maps**: Live, GPS-synced maps powered by Leaflet, tracking moving volunteers and active mission sectors with zero-latency telemetry via Firebase.
- **Comms Hub**: Integrated communication log listening to satellite transmissions, Telegram signals, and automated AI responses via **Gemini 2.0 Flash**.

### 📱 Cross-Channel Response System
- **Voice Agent Integration**: Direct AI Voice Agent line (+91 91705 60759) integrated into the field gateway.
- **Telegram Bot Sync**: Automated intake and status updates via the @CPFieldBot.

---

## ✨ Strategic Enhancements (Latest Deployment)

### 🔐 Multi-Layer Tactical Security
Implemented a dual-gate security system. Standard "Normal Gmail" users are verified via automated link dispatches. Volunteers must bypass an additional layer using one of the four unique **Tactical Access Codes** defined in the secure environment.

### 🖤 Absolute Black UI Protocol
The interface has been hardened for field use. Using a pure black (`#000000`) on white layout, we've purged all gray/low-contrast text. This ensures that coordinates, mission IDs, and AI-decoded reports are instantly readable in direct sunlight or low-light tactical situations.

---

## 🛠 Tech Stack

### **Frontend**
- **Framework**: Next.js 16 (Turbopack)
- **Styling**: Vanilla CSS + Tailwind CSS v4 (Absolute Black Protocol)
- **Primary Database**: **Firebase Realtime Database**
- **Authentication**: **Firebase Auth** (Email/Password + Google Verified)
- **Maps**: React-Leaflet (Leaflet.js)

### **Backend**
- **Framework**: FastAPI (Python)
- **AI Intelligence**: **Google Gemini 2.0 Flash (Mandatory Model)**
- **Voice Ops**: Vapi AI Voice Integration
- **Database Access**: Firebase Admin SDK
- **Notification Engine**: Telegram Bot API Integration

---

## 🚦 Getting Started

### **1. Prerequisites**
- Node.js (v20+)
- Python (v3.10+)
- **Firebase Project** (RTDB + Auth enabled)

### **2. Frontend Setup**
```bash
cd frontend
npm install
npm run dev
```

### **3. Backend Setup**
```bash
cd backend
python -m venv venv
# Windows
.\venv\Scripts\Activate
# Mac/Linux
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### **4. Environment Variables**

**Frontend (.env)**
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_DATABASE_URL=your_rtdb_url
NEXT_PUBLIC_VOLUNTEER_CODES=PULSE_ADMIN_1,PULSE_VOLUNTEER_2,PULSE_RESCUE_3,PULSE_CORE_4
```

**Backend (.env)**
```env
GEMINI_API_KEY=your_gemini_key
FIREBASE_SERVICE_ACCOUNT_PATH=firebase-admin.json
FIREBASE_DATABASE_URL=your_rtdb_url
TELEGRAM_BOT_TOKEN=your_bot_token
VAPI_API_KEY=your_vapi_key
VOLUNTEER_ALERT_PHONE=your_alert_phone
```

---

## 📁 Project Structure

- `frontend/`: Next.js 16 application with decentralized gateways.
- `backend/`: FastAPI service managing urgency scoring and notifications.
- `database/`: Real-time schema managed via **Firebase RTDB**.

---

## ⚖️ License
Personal / Technical Demonstration.

---

> [!TIP]
> Navigating directly to `/field` or `/volunteer` will initiate the decentralized "Tactical Handshake" protocol for immediate portal access.
