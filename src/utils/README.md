# src/utils — AI & Scoring Utilities

Two utility modules that power the intelligent features of Recovery Companion.

---

## `aiPriorityScore.js` — Patient Priority Scoring

**Type:** Pure synchronous function (no API, no async)

### Usage
```js
import { calculatePriorityScore } from './aiPriorityScore';

const { score, breakdown } = calculatePriorityScore(
  patientData,    // Firestore patient doc
  recentLogs,     // symptomLogs[] newest-first
  aiSummaries,    // aiSummaries[] newest-first
  unreadMessages  // number of unread chat messages
);

// score     → number 0–100
// breakdown → "Risk (high): 30pts | Severity: 18pts | Inactive 48hrs: 10pts"
```

### Scoring Factors

| # | Factor | Logic | Max |
|---|--------|-------|-----|
| 1 | **Base risk level** | critical=40, high=30, medium=20, low=10 | 40 |
| 2 | **Latest log severity** | avg severity of all symptoms in newest log × 2 | 20 |
| 3 | **Consecutive streak** | 3+=10pts, 6+=15pts, 9+=20pts from aiSummaries | 20 |
| 4 | **Unread AI alerts** | 5pts per unread summary, capped | 15 |
| 5 | **Inactivity** | 24hrs=5, 48hrs=10, 72hrs+=15, never logged=15 | 15 |
| 6 | **Trend direction** | comparing newest vs oldest of last 5 logs | +10/-5 |
| 7 | **Unread messages** | 2pts per unread chat message, capped | 6 |

Final score is clamped to **0–100**.

### Re-sort Triggers
`DoctorPatients.jsx` calls `rescore()` (which calls this function for every patient) whenever:
- Any patient submits a symptom log (`symptomLogs` onSnapshot)
- Any AI summary is created or read (`aiSummaries` onSnapshot)
- Any chat message is sent (`chats` onSnapshot)
- Every **30 minutes** via `setInterval` (inactivity drift)

---

## `aiSymptomCheck.js` — Claude AI Clinical Summaries

**Type:** Async function — calls Anthropic Claude API via Vite proxy

### Usage
Called automatically from `LogSymptoms.jsx` after every successful symptom log submission:
```js
checkConsecutiveSymptomsAndSummarize({
  patientId, doctorId, patientInfo, currentLog, latestMedications
});
```

### Flow

```
Patient submits log
       ↓
Fetch all previous logs for this patient (client-side sorted)
       ↓
For each symptom in the log:
  Count how many consecutive prior logs also contained it
       ↓
Streak ≥ 3 AND is a multiple of 3? (3, 6, 9, 12...)
       ↓ YES
Check if a summary already exists for this exact streak count (dedup)
       ↓ NOT YET
Build clinical prompt with patient info + severity history + medications
       ↓
Call Claude API (via /api/claude Vite proxy)
       ↓
Parse response → extract urgency level (Routine/Soon/Urgent)
       ↓
Save to Firestore: aiSummaries/{id}
  + Notify doctor: notifications/{doctorId}/items/{id}
```

### Fallback Template
If `VITE_CLAUDE_API_KEY` is not set or the API call fails, a deterministic template generates the same structured output using the severity data and patient info — the app works fully without a Claude key.

### Vite Proxy (no CORS issues)
Claude requires server-side requests. In dev, Vite proxies `/api/claude` → `https://api.anthropic.com/v1/messages`. In production, deploy behind a server/edge function or Firebase Function.

```js
// vite.config.js
'/api/claude': {
  target: 'https://api.anthropic.com',
  rewrite: path => path.replace(/^\/api\/claude/, '/v1/messages'),
}
```
