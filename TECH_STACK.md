# 🛠 Tech Stack — Recovery Companion

## Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 19 | UI component framework |
| **Vite** | 7 | Build tool, dev server, code-splitting |
| **React Router DOM** | 7 | Client-side routing with lazy-loaded routes |
| **Vanilla CSS** | — | Styling via design tokens, no framework |

## Backend / Infrastructure

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Firebase Authentication** | 12.9 | Email/password auth, multi-instance for admin user creation |
| **Cloud Firestore** | 12.9 | Real-time NoSQL database |
| **Firebase Storage** | 12.9 | Prescription image uploads |
| **Firebase Hosting** | — | Static hosting |

## AI / Intelligence

| Technology | Purpose |
|-----------|---------|
| **Anthropic Claude** (`claude-sonnet-4-20250514`) | Clinical narrative generation — triggered on symptom streaks, outputs urgency + intervention suggestions |
| **Rule-Based Priority Engine** (`aiPriorityScore.js`) | 7-factor weighted scoring (0–100) to rank patients by urgency in real-time — no external API |
| **Tesseract.js** (v7) | Client-side OCR — reads prescription images and pre-fills forms |

## Data Visualisation & Export

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Recharts** | 3 | Recovery trend charts on patient and doctor views |
| **jsPDF** | 4 | PDF export of medical visit records |

## UX / Notifications

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React Hot Toast** | 2.6 | In-app toast notifications |
| **Web Speech API** | browser native | Voice-to-text symptom input |
| **React Portals** | React built-in | Modal rendering — prevents focus loss on Firestore re-renders |

## Developer Tooling

| Tool | Purpose |
|------|---------|
| **Vite** `manualChunks` | Splits Firebase, React, Recharts, Tesseract, jsPDF into separate cacheable chunks |
| **React.lazy + Suspense** | Lazy-loads all 12 page components — only downloads what the user visits |
| **Firebase Admin SDK** | Server-side seeding scripts (`seed/seed.js`, `seed/seedAdmin.cjs`) |
| **ESLint** | Code quality |

## Deployment

| Platform | Usage |
|---------|-------|
| **Vercel** | Primary hosting (SPA rewrites via `vercel.json`) |
| **Firebase Hosting** | Alternative hosting (`firebase.json` configured) |
| **GitHub** | Source control, Vercel auto-deploy on push to `main` |

---

## Architecture Summary

```
Browser
  └── React SPA (lazy-loaded pages)
        ├── Firebase SDK ──► Firestore (real-time onSnapshot listeners)
        │                ──► Firebase Auth
        │                ──► Firebase Storage
        ├── /api/claude proxy ──► Anthropic Claude API
        │   (Vite dev proxy / Vercel serverless in prod)
        └── Tesseract.js (runs entirely in browser via WebAssembly)
```

## Environment Variables

```env
VITE_CLAUDE_API_KEY=sk-ant-...   # Anthropic API key (optional — fallback template used if missing)
```

Firebase config is hardcoded in `src/firebase.js` (public API keys — safe for client-side Firebase).
