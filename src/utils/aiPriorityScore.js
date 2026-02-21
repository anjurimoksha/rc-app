/**
 * AI Priority Score calculator — pure synchronous function.
 * Returns { score: number, breakdown: string }
 *
 * @param {object} patientData  - Firestore patient document
 * @param {Array}  recentLogs   - symptomLogs for this patient (newest first)
 * @param {Array}  aiSummaries  - aiSummaries for this patient (newest first)
 * @param {number} unreadMessages - count of unread chat messages from patient
 */
export function calculatePriorityScore(patientData, recentLogs = [], aiSummaries = [], unreadMessages = 0) {
    let score = 0;
    const parts = [];

    // ── Factor 1: Base risk level ────────────────────────────────────────────
    const riskKey = (patientData.risk || patientData.riskLevel || 'medium').toLowerCase();
    const riskPts = { critical: 40, high: 30, medium: 20, low: 10 }[riskKey] ?? 20;
    score += riskPts;
    parts.push(`Risk (${riskKey}): ${riskPts}pts`);

    // ── Factor 2: Latest log average severity (up to 20pts) ─────────────────
    let severityPts = 0;
    if (recentLogs.length > 0) {
        const latestLog = recentLogs[0];
        const syms = latestLog.symptoms || [];
        if (syms.length > 0) {
            const avg = syms.reduce((s, sym) => s + (sym.severity || 0), 0) / syms.length;
            severityPts = Math.round((avg / 10) * 20);
            score += severityPts;
        }
    }
    parts.push(`Severity: ${severityPts}pts`);

    // ── Factor 3: Consecutive streak from latest AI summary ─────────────────
    let streakPts = 0;
    const latestSummary = aiSummaries[0];
    if (latestSummary) {
        const count = latestSummary.consecutiveCount ?? latestSummary.consecutiveDays ?? 0;
        if (count >= 9) streakPts = 20;
        else if (count >= 6) streakPts = 15;
        else if (count >= 3) streakPts = 10;
        score += streakPts;
    }
    if (streakPts > 0) parts.push(`Streak: ${streakPts}pts`);

    // ── Factor 4: Unread AI alerts (5pts each, max 15pts) ────────────────────
    const unreadAlerts = aiSummaries.filter(s => !s.read).length;
    const alertPts = Math.min(unreadAlerts * 5, 15);
    score += alertPts;
    if (alertPts > 0) parts.push(`Unread Alerts: ${alertPts}pts`);

    // ── Factor 5: Days since last log (inactivity) ───────────────────────────
    let inactivePts = 15; // never logged = most concerning
    if (recentLogs.length > 0) {
        const lastLogTs = recentLogs[0].submittedAt?.toDate?.() ?? recentLogs[0].submittedAt;
        if (lastLogTs) {
            const hrs = (Date.now() - new Date(lastLogTs).getTime()) / (1000 * 60 * 60);
            if (hrs >= 72) inactivePts = 15;
            else if (hrs >= 48) inactivePts = 10;
            else if (hrs >= 24) inactivePts = 5;
            else inactivePts = 0;
        }
    }
    score += inactivePts;
    if (inactivePts > 0) parts.push(`Inactive ${inactivePts === 15 ? '72hrs+' : inactivePts === 10 ? '48hrs' : '24hrs'}: ${inactivePts}pts`);

    // ── Factor 6: Trend direction (last 5 logs) ───────────────────────────────
    let trendPts = 0;
    const logsForTrend = recentLogs.slice(0, 5);
    if (logsForTrend.length >= 2) {
        const avgSev = (log) => {
            const syms = log.symptoms || [];
            return syms.length ? syms.reduce((s, sym) => s + (sym.severity || 0), 0) / syms.length : 0;
        };
        const newest = avgSev(logsForTrend[0]);
        const oldest = avgSev(logsForTrend[logsForTrend.length - 1]);
        if (newest > oldest + 0.5) { trendPts = 10; parts.push(`Worsening Trend: ${trendPts}pts`); }
        else if (newest < oldest - 0.5) { trendPts = -5; parts.push(`Improving Trend: ${trendPts}pts`); }
        score += trendPts;
    }

    // ── Factor 7: Unread messages (2pts each, max 6pts) ───────────────────────
    const msgPts = Math.min(unreadMessages * 2, 6);
    score += msgPts;
    if (msgPts > 0) parts.push(`Unread Msgs: ${msgPts}pts`);

    return {
        score: Math.max(0, Math.min(100, Math.round(score))),
        breakdown: parts.join(' | '),
    };
}
