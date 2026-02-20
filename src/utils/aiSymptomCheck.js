import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Consecutive-submission streak check:
 *   - Fetches last 10 logs ordered by submittedAt DESC.
 *   - For each symptom in the current log, walks backwards and counts how many
 *     consecutive prior submissions also contained that symptom (streak breaks on
 *     the first submission that does NOT contain it).
 *   - Triggers AI summary at streaks of exactly 3, 6, 9, 12 … (multiples of 3)
 *     to avoid spamming the doctor while still alerting on ongoing patterns.
 */
export async function checkConsecutiveSymptomsAndSummarize({
    patientId, doctorId, patientInfo, currentLog, latestMedications
}) {
    try {
        // 1. Fetch last 10 logs ordered by submittedAt desc
        const q = query(
            collection(db, 'symptomLogs'),
            where('patientId', '==', patientId),
            orderBy('submittedAt', 'desc'),
            limit(10)
        );
        const snap = await getDocs(q);
        // Index 0 = most recent (the just-submitted log), 1 = previous, etc.
        const recentLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (recentLogs.length === 0) return;

        // 2. For each symptom in the current log, count consecutive streak
        const triggeredSymptoms = [];

        for (const sym of (currentLog.symptoms || [])) {
            let streak = 0;
            const streakDetails = []; // { date, submittedAt, severity, notes }

            for (const log of recentLogs) {
                const match = log.symptoms?.find(s => s.name === sym.name);
                if (match) {
                    streak++;
                    streakDetails.push({
                        date: log.date || '—',
                        severity: Number(match.severity),
                        notes: match.notes || '',
                    });
                } else {
                    break; // streak broken — stop counting
                }
            }

            // Only trigger at multiples of 3 (3, 6, 9, …)
            if (streak >= 3 && streak % 3 === 0) {
                triggeredSymptoms.push({ symptom: sym.name, streak, streakDetails });
            }
        }

        if (triggeredSymptoms.length === 0) return;

        for (const { symptom, streak, streakDetails } of triggeredSymptoms) {
            // 3. Dedup: only generate if we haven't already generated for this
            //    exact streak count (avoids re-generating on the same submission count)
            const existQ = query(
                collection(db, 'aiSummaries'),
                where('patientId', '==', patientId),
                where('symptomName', '==', symptom),
                where('consecutiveCount', '==', streak)
            );
            const existSnap = await getDocs(existQ);
            if (!existSnap.empty) continue; // already generated for this streak level

            // 4. Build prompt
            const severityList = streakDetails
                .map((d, i) => `Submission ${i + 1} (${d.date}): ${d.severity}/10${d.notes ? ` — "${d.notes}"` : ''}`)
                .join('\n');
            const medList = (latestMedications || [])
                .map(m => `${m.name} ${m.dosage} (${m.frequency})`)
                .join(', ') || 'None recorded';

            const prompt = `You are a clinical decision support assistant helping a doctor review a post-discharge patient's recovery.

Patient Details:
- Name: ${patientInfo.name}
- Age: ${patientInfo.age || '—'}
- Condition: ${patientInfo.diagnosis || patientInfo.condition || '—'}
- Current Medications: ${medList}

Symptom Pattern Detected:
- Symptom: ${symptom}
- Reported in ${streak} consecutive log submissions
- Severity scores (most recent first):
${severityList}

Task:
1. Write a brief clinical summary (3-4 sentences) explaining the pattern for the doctor.
2. Suggest 2-3 possible medication adjustments or interventions appropriate for this symptom and the patient's current condition. Clearly label these as suggestions for the doctor to evaluate — not direct prescriptions.
3. Indicate urgency level: Routine / Soon / Urgent based on severity trend.

Keep the tone clinical, concise, and factual. Always end with: "Final medical decision rests with the treating physician."`;

            // 5. Call Claude via Vite proxy, or use demo template
            const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
            let aiText = '';
            let urgencyLevel = 'Routine';

            if (apiKey && apiKey !== 'your_claude_api_key_here') {
                try {
                    const res = await fetch('/api/claude', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-claude-key': apiKey,
                        },
                        body: JSON.stringify({
                            model: 'claude-sonnet-4-20250514',
                            max_tokens: 600,
                            messages: [{ role: 'user', content: prompt }]
                        })
                    });
                    const data = await res.json();
                    aiText = data.content?.[0]?.text || '';
                } catch (_) { /* fall through to template */ }
            }

            // Demo/fallback template
            if (!aiText) {
                const avgSev = streakDetails.reduce((s, d) => s + d.severity, 0) / streakDetails.length;
                const maxSev = Math.max(...streakDetails.map(d => d.severity));
                urgencyLevel = maxSev >= 8 ? 'Urgent' : avgSev >= 6 ? 'Soon' : 'Routine';
                const trend = streakDetails[0].severity >= streakDetails[streakDetails.length - 1].severity
                    ? 'escalating'
                    : 'improving';

                aiText = `The patient ${patientInfo.name} has reported ${symptom} in ${streak} consecutive symptom log submissions, with severity scores ranging from ${Math.min(...streakDetails.map(d => d.severity))} to ${maxSev} out of 10. The ${trend} severity pattern is clinically notable in the context of ${patientInfo.diagnosis || patientInfo.condition || 'post-discharge recovery'}. This warrants evaluation to rule out complications or inadequate symptom management.

Suggested Interventions (for physician evaluation):
• Review current analgesic or symptomatic management — assess dosage adequacy given the ${trend} pattern.
• Consider scheduling an unplanned follow-up assessment within ${maxSev >= 7 ? '24–48' : '72'} hours if ${symptom.toLowerCase()} persists.
• Evaluate for secondary causes such as infection, procedural complication, or medication side-effect.

Urgency: ${urgencyLevel}. Final medical decision rests with the treating physician.`;
            } else {
                if (/urgent/i.test(aiText)) urgencyLevel = 'Urgent';
                else if (/soon/i.test(aiText)) urgencyLevel = 'Soon';
                else urgencyLevel = 'Routine';
            }

            // 6. Store in aiSummaries — include consecutiveCount for dedup
            const summaryRef = await addDoc(collection(db, 'aiSummaries'), {
                patientId, doctorId,
                patientName: patientInfo.name,
                symptomName: symptom,
                consecutiveCount: streak,          // used for dedup (trigger at 3, 6, 9…)
                consecutiveDays: streak,           // kept for UI compatibility
                severityTrend: streakDetails.map(d => d.severity),
                rawPrompt: prompt,
                aiSummary: aiText,
                urgencyLevel,
                generatedDate: new Date().toISOString().split('T')[0],
                generatedAt: serverTimestamp(),
                read: false,
            });

            // 7. Notify doctor
            await addDoc(collection(db, 'notifications', doctorId, 'items'), {
                type: 'ai_alert',
                title: '⚡ AI Clinical Alert',
                message: `⚡ AI Alert: ${patientInfo.name} has reported ${symptom} in ${streak} consecutive log submissions. Review suggested.`,
                patientId, patientName: patientInfo.name,
                summaryId: summaryRef.id,
                urgencyLevel,
                timestamp: serverTimestamp(),
                read: false,
            });

            console.log(`✅ AI summary created — ${patientInfo.name} / ${symptom} / streak: ${streak}`);
        }
    } catch (err) {
        console.error('AI symptom check failed:', err);
    }
}
