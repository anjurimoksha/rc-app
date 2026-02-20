/**
 * Quick patch — rename "Priya Sharma" patient to "Meera Kapoor" to avoid confusion with Doctor name.
 * Run: node seed/patch-rename.cjs
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccount.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
    // Rename patient doc
    await db.doc('patients/priya-sharma-p').update({
        name: 'Meera Kapoor',
        initials: 'MK',
    });
    console.log('✅  Renamed patient Priya Sharma → Meera Kapoor');

    // Delete all existing symptom logs for this patient and re-create with new name
    const logs = await db.collection('symptomLogs').where('patientId', '==', 'priya-sharma-p').get();
    const batch = db.batch();
    logs.docs.forEach(d => batch.update(d.ref, { patientName: 'Meera Kapoor' }));
    await batch.commit();
    console.log(`✅  Updated ${logs.size} symptom log(s) with new name`);

    // Update any notifications referencing old name
    const { getAuth } = require('firebase-admin/auth');
    // Update doctor notifications
    const notifSnap = await db.collection('notifications').get();
    for (const userDoc of notifSnap.docs) {
        const items = await userDoc.ref.collection('items').where('patientName', '==', 'Priya Sharma').get();
        if (!items.empty) {
            const nb = db.batch();
            items.docs.forEach(d => nb.update(d.ref, { patientName: 'Meera Kapoor' }));
            await nb.commit();
            console.log(`✅  Updated ${items.size} notification(s) for user ${userDoc.id}`);
        }
    }

    console.log('\n🎉  Patch complete! Patient is now "Meera Kapoor"');
    process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
