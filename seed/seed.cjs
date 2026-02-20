/**
 * Recovery Companion — Demo Data Seeder
 * This script creates two Firebase Auth accounts and populates Firestore with demo data.
 * 
 * Instructions:
 * 1. Go to Firebase Console → Project Settings → Service Accounts → Generate new private key
 * 2. Save it as seed/serviceAccount.json
 * 3. Run: node seed/seed.js
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

let serviceAccount;
try {
    serviceAccount = require('./serviceAccount.json');
} catch {
    console.error('\n❌  Missing seed/serviceAccount.json');
    console.error('   Download it from Firebase Console → Project Settings → Service Accounts\n');
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

async function createUser(email, password, name, role) {
    let uid;
    try {
        const user = await auth.createUser({ email, password, displayName: name });
        uid = user.uid;
        console.log(`✅  Created auth user: ${email} (${uid})`);
    } catch (err) {
        if (err.code === 'auth/email-already-exists') {
            const user = await auth.getUserByEmail(email);
            uid = user.uid;
            console.log(`ℹ️   Auth user exists: ${email} (${uid})`);
        } else throw err;
    }
    await db.doc(`users/${uid}`).set({ uid, email, name, role, hospital: 'Apollo Hospitals', createdAt: Timestamp.now() });
    return uid;
}

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}
function dateStr(n) { return daysAgo(n).toISOString().split('T')[0]; }

async function main() {
    console.log('\n🌱  Starting Recovery Companion seeder...\n');

    // 1. Create auth accounts
    const doctorUid = await createUser('doctor@demo.com', 'Doctor@123', 'Dr. Priya Sharma', 'doctor');
    const doc2Uid = await createUser('doctor2@demo.com', 'Doctor@123', 'Dr. Rahul Mehta', 'doctor');
    const doc3Uid = await createUser('doctor3@demo.com', 'Doctor@123', 'Dr. Sunita Verma', 'doctor');

    // Set specialties for more doctors
    await db.doc(`users/${doc2Uid}`).update({ specialty: 'Cardiology', hospital: 'Fortis Hospital, Delhi' });
    await db.doc(`users/${doc3Uid}`).update({ specialty: 'Pulmonology', hospital: 'Max Healthcare, Delhi' });

    const patientUid = await createUser('patient@demo.com', 'Patient@123', 'John Doe', 'patient');

    // 2. Create patients collection (doctor's patient roster)
    const patients = [
        { id: patientUid, name: 'John Doe', initials: 'JD', age: 52, gender: 'M', risk: 'critical', diagnosis: 'Post Knee Replacement', recoveryDay: 12, lastLog: dateStr(1), flagged: true, assignedDoctorId: doctorUid, nextAppt: '2026-02-22', vitals: { temp: 38.1, hr: 92, bp: '142/88', spo2: 96 }, lastSymptoms: [{ name: 'Pain', severity: 8 }] },
        { id: 'meera-kapoor', name: 'Meera Kapoor', initials: 'MK', age: 58, gender: 'F', risk: 'high', diagnosis: 'Cardiac Surgery Recovery', recoveryDay: 15, lastLog: dateStr(1), flagged: true, assignedDoctorId: doctorUid, nextAppt: '2026-02-23', vitals: { temp: 37.4, hr: 85, bp: '130/85', spo2: 97 }, lastSymptoms: [{ name: 'Fatigue', severity: 7 }] },
        { id: 'anita-desai', name: 'Anita Desai', initials: 'AD', age: 67, gender: 'F', risk: 'medium', diagnosis: 'Hip Fracture Recovery', recoveryDay: 21, lastLog: dateStr(2), flagged: false, assignedDoctorId: doctorUid, nextAppt: '2026-03-01', vitals: { temp: 36.8, hr: 75, bp: '118/74', spo2: 98 }, lastSymptoms: [{ name: 'Pain', severity: 4 }] },
        { id: 'ramesh-kumar', name: 'Ramesh Kumar', initials: 'RK', age: 34, gender: 'M', risk: 'low', diagnosis: 'Appendectomy Recovery', recoveryDay: 6, lastLog: dateStr(1), flagged: false, assignedDoctorId: doctorUid, nextAppt: '2026-02-26', vitals: { temp: 36.7, hr: 71, bp: '112/72', spo2: 99 }, lastSymptoms: [{ name: 'Pain', severity: 2 }] },
        { id: 'suresh-verma', name: 'Suresh Verma', initials: 'SV', age: 61, gender: 'M', risk: 'low', diagnosis: 'Diabetes Management', recoveryDay: 3, lastLog: dateStr(3), flagged: false, assignedDoctorId: doctorUid, nextAppt: '2026-03-05', vitals: { temp: 36.6, hr: 68, bp: '124/80', spo2: 98 }, lastSymptoms: [{ name: 'Fatigue', severity: 1 }] },
    ];

    for (const p of patients) {
        await db.doc(`patients/${p.id}`).set(p);
        console.log(`✅  Patient: ${p.name}`);
    }

    // 3. Seed 14 days of symptom logs for John Doe
    console.log('\n📝  Seeding 14 days of symptom logs for John Doe...');
    const logData = [
        { day: 13, pain: 8, fatigue: 6, swelling: 7, flagged: true },
        { day: 12, pain: 7, fatigue: 6, swelling: 6, flagged: false },
        { day: 11, pain: 7, fatigue: 5, swelling: 6, flagged: false },
        { day: 10, pain: 6, fatigue: 5, swelling: 5, flagged: false },
        { day: 9, pain: 8, fatigue: 7, swelling: 6, flagged: true },
        { day: 8, pain: 7, fatigue: 6, swelling: 5, flagged: false },
        { day: 7, pain: 6, fatigue: 5, swelling: 4, flagged: false },
        { day: 6, pain: 5, fatigue: 5, swelling: 4, flagged: false },
        { day: 5, pain: 5, fatigue: 4, swelling: 3, flagged: false },
        { day: 4, pain: 4, fatigue: 4, swelling: 3, flagged: false },
        { day: 3, pain: 4, fatigue: 3, swelling: 2, flagged: false },
        { day: 2, pain: 3, fatigue: 3, swelling: 2, flagged: false },
        { day: 1, pain: 3, fatigue: 2, swelling: 2, flagged: false },
        { day: 0, pain: 2, fatigue: 2, swelling: 1, flagged: false },
    ];

    for (const l of logData) {
        const date = daysAgo(l.day);
        await db.collection('symptomLogs').add({
            patientId: patientUid,
            patientName: 'John Doe',
            date: dateStr(l.day),
            submittedAt: Timestamp.fromDate(date),
            assignedDoctorId: doctorUid,
            flagged: l.flagged,
            symptoms: [
                { name: 'Pain', emoji: '🤕', severity: l.pain, notes: l.pain >= 8 ? 'Sharp pain around knee joint, worse in mornings' : 'Tolerable pain' },
                { name: 'Fatigue', emoji: '😴', severity: l.fatigue, notes: '' },
                { name: 'Swelling', emoji: '🦵', severity: l.swelling, notes: l.swelling >= 6 ? 'Swelling around incision site' : '' },
            ],
            vitals: { temp: 37 + l.pain * 0.1, bpSys: 120 + l.pain * 2, bpDia: 80 + l.pain, hr: 70 + l.pain, spo2: 98 - (l.pain > 7 ? 2 : 0), sugar: 100 + l.day * 2 },
        });
    }
    console.log('✅  14 days of logs seeded');

    // 4. Medical visit records
    console.log('\n🏥  Seeding medical visit records...');
    const medVisits = [
        {
            patientId: patientUid, doctorId: doctorUid, doctorName: 'Dr. Priya Sharma',
            visitDate: '8 February 2026', hospital: 'Apollo Hospitals, Delhi', department: 'Orthopaedics',
            ward: 'Surgical Ward B', duration: '5 days',
            diagnosis: 'Right Total Knee Replacement Surgery', tags: ['Surgery', 'Post-Op', 'Orthopaedics'],
            medications: [
                { name: 'Ibuprofen', dosage: '400mg', frequency: '3x/day', duration: '14 days', instructions: 'Take with food', status: 'active' },
                { name: 'Pantoprazole', dosage: '40mg', frequency: '1x/day (morning)', duration: '14 days', instructions: 'Take 30 min before breakfast', status: 'active' },
                { name: 'Enoxaparin', dosage: '40mg/0.4mL', frequency: 'Once daily', duration: '10 days', instructions: '—', status: 'completed' },
            ],
            doctorNotes: 'Patient tolerated total knee replacement under spinal anaesthesia. Post-op vitals stable. Non-weight-bearing for 2 weeks, then partial weight-bearing with walker. Wound site looks clean with no signs of infection. Avoid strenuous activity for 4 weeks. Schedule follow-up in 14 days.',
            followUpInstructions: [
                'Avoid heavy lifting (>5 kg) for 4 weeks.',
                'Keep incision site clean and dry. Change dressing every 2 days.',
                'Light walking 15–20 minutes twice daily is encouraged.',
                'Diet: Start soft foods, avoid heavy meals for 2 weeks.',
                'Scheduled follow-up: February 22, 2026 — Apollo Hospitals OPD, Dr. Sharma.',
            ],
        },
        {
            patientId: patientUid, doctorId: doctorUid, doctorName: 'Dr. Priya Sharma',
            visitDate: '15 January 2026', hospital: 'Apollo Hospitals, Delhi', department: 'Orthopaedics',
            ward: 'OPD',
            diagnosis: 'Pre-operative Assessment — Right Knee Osteoarthritis', tags: ['Pre-op', 'Orthopaedics'],
            medications: [
                { name: 'Diclofenac', dosage: '75mg', frequency: '2x/day', duration: '2 weeks', instructions: 'After meals', status: 'completed' },
                { name: 'Calcium + Vit D3', dosage: '500mg/250IU', frequency: '2x/day', duration: 'Ongoing', instructions: 'With meals', status: 'active' },
            ],
            doctorNotes: 'Grade IV osteoarthritis confirmed on X-ray. Surgical intervention recommended. Patient counselled about procedure, risks, and rehabilitation. CBC, ECG, and Echo ordered.',
        },
        {
            patientId: patientUid, doctorId: doctorUid, doctorName: 'Dr. Priya Sharma',
            visitDate: '20 November 2025', hospital: 'General OPD — Subramanya Clinic', department: 'General Medicine',
            ward: 'OPD',
            diagnosis: 'Hypertension Follow-up', tags: ['Chronic', 'Hypertension'],
            medications: [
                { name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily', duration: 'Ongoing', instructions: 'Morning after food', status: 'active' },
                { name: 'Telmisartan', dosage: '40mg', frequency: 'Once daily', duration: 'Ongoing', instructions: 'Morning before food', status: 'active' },
            ],
            doctorNotes: 'BP well-controlled at 128/82. Patient advised to continue current medications. Low-salt diet recommended. Follow-up in 3 months.',
        },
    ];

    for (const v of medVisits) {
        await db.collection('medicalVisits').add(v);
    }
    console.log('✅  3 medical visits seeded');

    // 5. Pre-existing chat messages
    console.log('\n💬  Seeding chat messages...');
    const chatId = `${patientUid}_${doctorUid}`;
    const chatMsgs = [
        { senderId: patientUid, senderName: 'John Doe', senderRole: 'patient', receiverId: doctorUid, content: 'Good morning Doctor! My knee has been aching a lot since last night. The swelling seems to have increased too.', daysAgo: 2, minuteOffset: 0, read: true },
        { senderId: doctorUid, senderName: 'Dr. Priya Sharma', senderRole: 'doctor', receiverId: patientUid, content: 'Hello John. I can see your log from this morning. The pain and swelling at this stage of recovery can be expected, but 8/10 is something we need to monitor closely. Please apply ice for 15 minutes every 2 hours and keep the leg elevated.', daysAgo: 2, minuteOffset: 30, read: true },
        { senderId: patientUid, senderName: 'John Doe', senderRole: 'patient', receiverId: doctorUid, content: 'Thank you Doctor. I have been keeping it elevated. Should I be worried about the fever (38.1°C)?', daysAgo: 2, minuteOffset: 45, read: true },
        { senderId: doctorUid, senderName: 'Dr. Priya Sharma', senderRole: 'doctor', receiverId: patientUid, content: 'A low-grade fever in the first 2 weeks post-surgery can be normal due to the body\'s inflammatory response. However, if it goes above 38.5°C or you notice increased redness around the incision site, call me immediately. I\'ve already reviewed your latest log. Let\'s do a video check-in tomorrow.', daysAgo: 1, minuteOffset: 0, read: true },
    ];

    for (const msg of chatMsgs) {
        const ts = daysAgo(msg.daysAgo);
        ts.setMinutes(ts.getMinutes() + msg.minuteOffset);
        await db.collection('chats').doc(chatId).collection('messages').add({
            senderId: msg.senderId,
            senderName: msg.senderName,
            senderRole: msg.senderRole,
            receiverId: msg.receiverId,
            content: msg.content,
            timestamp: Timestamp.fromDate(ts),
            read: msg.read,
        });
    }
    console.log('✅  4 chat messages seeded');

    // 6. Sample notifications for doctor
    await db.collection('notifications').doc(doctorUid).collection('items').add({
        type: 'critical_alert', title: '🚨 Critical Alert',
        message: 'John Doe logged Pain: 8/10. Immediate review recommended.',
        patientId: patientUid, patientName: 'John Doe',
        timestamp: Timestamp.fromDate(daysAgo(1)), read: false,
    });
    await db.collection('notifications').doc(doctorUid).collection('items').add({
        type: 'log_submitted', title: '📋 New Log',
        message: 'Priya Sharma submitted their daily symptom log.',
        patientId: 'meera-kapoor', patientName: 'Meera Kapoor',
        timestamp: Timestamp.fromDate(daysAgo(1)), read: false,
    });
    console.log('✅  Doctor notifications seeded');

    console.log(`\n🎉  Seeding complete!\n`);
    console.log(`📋  Demo Credentials:`);
    console.log(`   Patient:  patient@demo.com / Patient@123  (UID: ${patientUid})`);
    console.log(`   Doctor:   doctor@demo.com / Doctor@123   (UID: ${doctorUid})`);
    console.log(`\n⚠️   IMPORTANT: Update DOCTOR_DEMO_ID in LogSymptoms.jsx and PatientChat.jsx to: "${doctorUid}"\n`);
    process.exit(0);
}

main().catch(err => { console.error('❌ Seeder failed:', err); process.exit(1); });
