/**
 * Seeds the admin account into Firebase Auth + Firestore.
 * Run: node seed/seedAdmin.cjs
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

let serviceAccount;
try {
    serviceAccount = require('./serviceAccount.json');
} catch {
    console.error('\n❌  Missing seed/serviceAccount.json');
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

async function main() {
    console.log('\n🌱  Seeding admin account...\n');
    const email = 'admin@demo.com';
    const password = 'Admin@123';
    const name = 'System Admin';

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

    await db.doc(`users/${uid}`).set({
        uid, email, name,
        role: 'admin',
        hospital: 'Apollo Hospitals',
        createdAt: Timestamp.now(),
    }, { merge: true });

    console.log(`✅  Firestore users/${uid} written with role: admin`);
    console.log('\n🎉  Admin account ready!');
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}\n`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
