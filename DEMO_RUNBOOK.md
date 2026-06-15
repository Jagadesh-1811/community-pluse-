# CommunityPulse Evaluation & Demo Runbook

This runbook guides you through the full operational cycle of CommunityPulse, testing all core channels, triage mechanisms, and real-time syncing capabilities.

---

## 1. Prerequisites & Setup

Ensure the local servers are running:
1. **Backend Gateway:**
   ```bash
   cd backend
   .\venv\Scripts\python -m uvicorn main:app --reload
   ```
2. **Frontend Portal:**
   ```bash
   cd frontend
   npm run dev
   ```
3. Open `http://localhost:3000` in your browser.

---

## 2. Phase 1: Intake & Multimodal AI Triage

### Test Case A: Web Portal Incident Intake
1. Navigate to `/field` (Field Reporting Portal).
2. Type: `"I am trapped on the second floor due to heavy flooding. There is a child with me who has a high fever."`
3. Click **Submit Report**.
4. **Expected Result:** The incident is triaged by Gemini as `medical` or `safety` with a high urgency score (9/10), and a customized YouTube first-aid guide is automatically associated.

### Test Case B: WebRTC Voice Intake
1. Open the `/field` page.
2. Click **Tap to speak to AI**. Grant microphone permissions.
3. Speak clearly: `"There is a bad car accident here on Main Street. A child was hit by a speeding vehicle and is bleeding."`
4. Wait for the call to finish.
5. **Expected Result:** A voice report is automatically created in Firebase under `/needs` with the full audio recording, caller metadata, and high-priority flags.

---

## 3. Phase 2: Strategic Command Center Visualization

1. Navigate to `/admin` (Command Center).
2. Enter the admin credentials (or sign in as an admin).
3. Look at the live tracking dashboard.
4. **Expected Result:** 
   * Both incidents from Phase 2 appear instantly on the map and active lists without page refreshing.
   * Visual indicator states (e.g. flashing high-urgency icons) indicate critical tasks.

---

## 4. Phase 3: Volunteer Dispatch Operations

1. Navigate to `/login`. Sign up/in as a **Volunteer** using code `PULSE_VOLUNTEER_2`.
2. Navigate to the `/volunteer` dashboard.
3. Under available matches, you will see recommended needs sorted by urgency score.
4. Click **Initiate Dispatch** on the critical report.
   * **Expected Result:** Status shifts to `"in_progress"` instantly on both the volunteer's view and the administrator's command center map.
5. Provide operational notes and click **Mark as Resolved**.
   * **Expected Result:** Status updates to `"resolved"` and the incident is archived to history logs.
