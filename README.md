# 🏥 Recovery Companion

> **AI-powered post-discharge patient monitoring platform** — built for the webathon.

A full-stack web application that bridges the gap between hospitals and recovering patients. Doctors monitor patients in real-time, admins manage the entire system, and patients log their daily symptoms — all in one seamless interface.

---

## ✨ Features at a Glance

### 🔐 Role-Based Access
Three completely separate portals — Patient, Doctor, Admin — each with its own dashboard, navigation, and permissions. Login with role selection pills (Patient | Doctor | Admin).

### 👤 Patient Portal
- **Dashboard** — upcoming appointment banner (live from Firestore), recovery stats, notifications
- **Log Symptoms** — select symptoms (Pain, Fatigue, Nausea, etc.), drag severity sliders (1–10), add notes, log vitals (temp, BP, HR, SpO₂, sugar). Voice input supported.
- **Medical History** — all past visits and prescriptions with PDF export
- **Recovery Trends** — charts of symptom severity over time
- **Chat** — real-time messaging with assigned doctor

### 🩺 Doctor Portal
- **My Patients** — patients sorted by **AI Priority Score** (0–100) calculated from 7 real-time factors. Score badge on every card with tooltip breakdown. Fully automatic re-sort when any patient submits a new log.
- **Patient Detail** — full chat window, symptom log viewer with doctor response, medical history with inline edit & PDF export, recovery trend charts, AI clinical summary card
- **AI Summaries** — when a symptom appears in 3+ consecutive logs, Claude AI generates a clinical narrative with urgency level (Routine / Soon / Urgent) and intervention suggestions

### 🔧 Admin Portal
- **Dashboard** — stats for doctors, patients, unassigned patients
- **Doctors** — add doctors (Firebase Auth + Firestore), search by name/email/specialization, view credentials
- **Patients** — add patients (3-step flow: register → prescription → credentials), search by name/email/condition, click any row to view full patient profile + prescription history + add new visit
- **Assignments** — assign or reassign patients to doctors in one click

---

## 🤖 AI Integrations

### 1. Claude API — Clinical Narrative Summaries
When a patient logs the same symptom for 3, 6, or 9+ consecutive days, the app calls **Anthropic's Claude Sonnet** with a structured clinical prompt. Claude returns:
- A 3–4 sentence clinical summary of the pattern
- 2–3 medication/intervention suggestions (labelled as suggestions for physician evaluation)
- An urgency level: **Routine / Soon / Urgent**

The summary is saved to Firestore and shown as an **⚡ AI Generated Summary** card on the doctor's patient detail page. A fallback template is used if no API key is configured.

### 2. Rule-Based AI Priority Scoring (browser-side, no API)
A weighted formula (`src/utils/aiPriorityScore.js`) scores each patient 0–100 and sorts the doctor's patient list in real-time:

| Factor | Max |
|--------|-----|
| Base risk level (Critical → Low) | 40 pts |
| Latest log avg symptom severity | 20 pts |
| Consecutive symptom streak (3/6/9+) | 20 pts |
| Unread AI alerts | 15 pts |
| Days since last log (inactivity) | 15 pts |
| Trend direction (worsening/improving) | ±10 pts |
| Unread chat messages | 6 pts |

### 3. Tesseract.js — OCR Prescription Scanning
Admins can upload a photo of a handwritten or printed prescription. Tesseract.js reads the text client-side (no server) and pre-fills the prescription form for editing.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 19 + Vite 7 |
| Routing | React Router DOM v7 |
| Database & Auth | Firebase Firestore + Firebase Authentication |
| File Storage | Firebase Storage |
| AI — Narratives | Anthropic Claude (claude-sonnet-4-20250514) |
| AI — Scoring | Custom rule-based engine (`aiPriorityScore.js`) |
| OCR | Tesseract.js v7 |
| Charts | Recharts v3 |
| PDF Export | jsPDF v4 |
| Notifications | React Hot Toast |
| Styling | Vanilla CSS (design tokens) |

---

## 📁 Project Structure

```
rc-app/
├── src/
│   ├── App.jsx                  # Routes, lazy-loading, PrivateRoute, role guards
│   ├── firebase.js              # Firebase init (primary + secondary auth instances)
│   ├── index.css                # Design system — tokens, components, utilities
│   ├── contexts/
│   │   └── AuthContext.jsx      # Auth state, login, adminCreateUser, userRole
│   ├── components/
│   │   ├── Navbar.jsx           # Role-aware navigation bar
│   │   ├── ChatWindow.jsx       # Real-time chat component (patient ↔ doctor)
│   │   ├── LogAndAiModal.jsx    # Doctor's symptom log viewer + AI summary
│   │   ├── PrescriptionModal.jsx# Prescription form with OCR (admin use)
│   │   ├── VoiceInput.jsx       # Web Speech API voice-to-text
│   │   ├── Footer.jsx           # Patient portal footer
│   │   └── AddPatientModal.jsx  # Reusable add-patient form
│   ├── pages/
│   │   ├── Login.jsx            # Role-pill login page
│   │   ├── patient/
│   │   │   ├── Dashboard.jsx    # Patient home — stats, appointment banner, notifications
│   │   │   ├── SelectDoctor.jsx # Shows assigned doctor, navigates to log
│   │   │   ├── LogSymptoms.jsx  # Symptom logging + vitals + chat tab
│   │   │   ├── MedicalHistory.jsx # Past visits + PDF export
│   │   │   ├── Trends.jsx       # Recovery charts
│   │   │   └── PatientChat.jsx  # Dedicated chat page
│   │   ├── doctor/
│   │   │   ├── DoctorPatients.jsx    # Patient list with AI priority scoring
│   │   │   └── DoctorPatientDetail.jsx # Full patient workspace
│   │   └── admin/
│   │       ├── AdminLayout.jsx       # Admin sidebar + layout wrapper
│   │       ├── AdminDashboard.jsx    # System stats
│   │       ├── AdminDoctors.jsx      # Doctor management + search
│   │       ├── AdminPatients.jsx     # Patient management + search + detail drawer
│   │       └── AdminAssignments.jsx  # Patient ↔ doctor assignment
│   └── utils/
│       ├── aiPriorityScore.js   # 7-factor patient priority scoring function
│       └── aiSymptomCheck.js    # Consecutive streak detection + Claude API call
├── seed/
│   ├── seed.js                  # Demo data seeder (Node.js + Firebase Admin)
│   └── seedAdmin.cjs            # Seeds admin@demo.com account
├── firebase.json                # Firebase Hosting config
├── .firebaserc                  # Firebase project alias
├── vite.config.js               # Vite build config + Vite proxy for Claude API
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A Firebase project with **Firestore**, **Authentication** (Email/Password), and **Storage** enabled
- (Optional) An Anthropic API key for Claude AI summaries

### 1. Clone & Install
```bash
git clone <repo-url>
cd rc-app
npm install
```

### 2. Configure Environment
Create a `.env` file in the root:
```env
VITE_CLAUDE_API_KEY=your_anthropic_api_key_here
```

Update `src/firebase.js` with your Firebase project config.

### 3. Seed Demo Data
```bash
# Seed admin account
node seed/seedAdmin.cjs

# Seed demo patients and doctors
node seed/seed.js
```

### 4. Run Locally
```bash
npm run dev
```
App runs at `http://localhost:5173`

### 5. Build & Deploy
```bash
npm run build
npx firebase-tools deploy --only hosting
```

---

## 👤 Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@demo.com | (set during seed) |
| Doctor | Created via Admin portal | Set at creation |
| Patient | Created via Admin portal | Set at creation |

---

## 🔑 Key Design Decisions

### No Composite Firestore Indexes
All queries use simple `where()` equality filters only. Sorting is done client-side to avoid requiring index configuration in Firebase Console.

### Modals via React Portals
All modals render via `ReactDOM.createPortal(..., document.body)`, completely decoupled from the parent component tree. This prevents Firestore `onSnapshot` re-renders from stealing focus from modal inputs.

### Secondary Firebase Auth Instance
Admin creating a new doctor/patient uses a **secondary Firebase app instance** (`secondaryAuth`). This lets the admin stay logged in while creating new accounts without their session being replaced.

### Lazy-Loaded Routes + Vendor Chunk Splitting
All 12 pages are loaded on-demand via `React.lazy()`. Vendor libraries (Firebase, React, Recharts, Tesseract, jsPDF) are split into separately-cached chunks via Vite `manualChunks`.

---

## 📄 License
Built for webathon — all rights reserved.
