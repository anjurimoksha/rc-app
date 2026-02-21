# Firestore Data Model — Recovery Companion

All collections and their field schemas.

---

## `users/{uid}`
Stores profile for every authenticated user (patient, doctor, admin).

```
uid              string   Firebase Auth UID (= document ID)
email            string
name             string
role             'patient' | 'doctor' | 'admin'
createdAt        Timestamp
assignedDoctorId string?  (patients only) UID of their doctor
age              string?  (patients only)
gender           string?  (patients only)
phone            string?
condition        string?  (patients) reason for visit
riskLevel        string?  (patients) 'critical'|'high'|'medium'|'low'
admissionDate    string?
hospital         string?  (doctors)
specialization   string?  (doctors)
```

---

## `patients/{uid}`
Mirror of patient user data, optimised for doctor queries.
Document ID = Firebase Auth UID (matches `users/{uid}`).

```
uid              string
email            string
name             string
age              string
gender           string
phone            string
diagnosis        string   (= condition)
condition        string
risk             string   'critical'|'high'|'medium'|'low'
riskLevel        string
assignedDoctorId string?
recoveryDay      number
admissionDate    string?
flagged          boolean  true if any log has severity ≥ 8
createdAt        Timestamp
```

---

## `symptomLogs/{id}`
One document per symptom log submission by a patient.

```
patientId        string
patientName      string
date             string   YYYY-MM-DD
submittedAt      Timestamp
assignedDoctorId string
flagged          boolean
symptoms         Array<{
  name:     string
  emoji:    string
  severity: number  1-10
  notes:    string
}>
vitals           {
  temp:  number|null   °C
  bpSys: number|null   mmHg
  bpDia: number|null   mmHg
  hr:    number|null   bpm
  spo2:  number|null   %
  sugar: number|null   mg/dL
}
```

---

## `logResponses/{logId}/responses/{id}`
Doctor's text responses to a specific symptom log.

```
doctorId         string
doctorName       string
message          string
timestamp        Timestamp
```

---

## `medicalVisits/{id}`
Each prescription/visit added by admin creates one document.

```
patientId        string
doctorId         string
doctorName       string
hospital         string
department       string
ward             string
visitDate        string   YYYY-MM-DD
diagnosis        string
tags             string[]
doctorNotes      string   (OCR text or manual notes)
duration         string
medications      Array<{
  name:         string
  dosage:       string
  frequency:    string
  duration:     string
  status:       'active'|'completed'
  instructions: string
}>
followUpInstructions  string[]
createdAt        Timestamp
```

---

## `prescriptions/{id}`
Raw prescription records (parallel to medicalVisits, stores image URL + OCR).

```
patientId        string
doctorId         string
doctorName       string
prescriptionDate string
documentType     'Prescription'|'Lab Report'|'Discharge Summary'|'Other'
imageUrl         string   Firebase Storage URL
extractedText    string   raw OCR output
editedText       string   user-corrected OCR
diagnosisNotes   string
followUpDate     string?
medications      Array<{ name, dosage, frequency, duration }>
createdAt        Timestamp
```

---

## `aiSummaries/{id}`
One document per AI-generated clinical summary (triggered by symptom streaks).

```
patientId        string
doctorId         string
patientName      string
symptomName      string
consecutiveCount number   streak length that triggered this
consecutiveDays  number   (same as consecutiveCount, kept for UI)
severityTrend    number[] e.g. [8, 7, 9]
aiSummary        string   Claude-generated or fallback narrative
urgencyLevel     'Routine'|'Soon'|'Urgent'
rawPrompt        string   the prompt sent to Claude
generatedDate    string   YYYY-MM-DD
generatedAt      Timestamp
read             boolean  false = unread by doctor
```

---

## `notifications/{userId}/items/{id}`
In-app notifications; subcollection under each user's UID.

```
type      string   'log_submitted'|'doctor_response'|'new_prescription'|'ai_alert'|'doctor_assigned'|'critical_alert'
title     string
message   string
patientId string?
logId     string?
summaryId string?
timestamp Timestamp
read      boolean
```

---

## `chats/{chatId}/messages/{id}`
Real-time chat between patient and doctor.
`chatId` format: `{patientId}_{doctorId}`

```
text         string
senderId     string
receiverId   string
senderName   string
timestamp    Timestamp
read         boolean
```

---

## Query Patterns (no composite indexes required)

All queries use simple single-field `where()` equality filters.
Sorting is done client-side to avoid Firestore composite index requirements.

| Collection | Query |
|-----------|-------|
| `patients` | `where('assignedDoctorId', '==', doctorUid)` |
| `symptomLogs` | `where('patientId', '==', patientId)` |
| `medicalVisits` | `where('patientId', '==', patientId)` |
| `aiSummaries` | `where('patientId', '==', patientId)` + `where('doctorId', '==', doctorUid)` |
| `prescriptions` | `where('patientId', '==', patientId)` |
| `notifications` | subcollection under `/{userId}/items` |
| `chats` | subcollection under `/{chatId}/messages` |
