import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadServiceAccount(): any {
  let account: any;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else {
    const filePath = path.resolve(
      process.cwd(),
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json'
    );
    if (!fs.existsSync(filePath)) {
      throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON or provide firebase-service-account.json.');
    }
    account = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  if (account.private_key) {
    account.private_key = String(account.private_key).replace(/\\n/g, '\n');
  }
  return account;
}

function formatIst(timestamp: unknown): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(new Date(value));
  const fields: Record<string, string> = {};
  for (const part of parts) fields[part.type] = part.value;
  return `${fields.day} ${fields.month} ${fields.year}, ${fields.hour}:${fields.minute}:${fields.second} ${(fields.dayPeriod || '').toUpperCase()}`;
}

async function main() {
  const account = loadServiceAccount();
  const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(account) });
  const db = getFirestore(app);
  const collection = db.collection('blinkpad_pages');

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let updated = 0;

  while (true) {
    let query = collection.orderBy(FieldPath.documentId()).limit(400);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const files = Array.isArray(data.files)
        ? data.files.map((file: any) => ({
            ...file,
            uploaded_at_ist: formatIst(file.uploaded_at),
            expires_at_ist: formatIst(file.expires_at),
          }))
        : [];

      const values: Record<string, unknown> = {
        created_at_ist: formatIst(data.created_at),
        expires_at_ist: formatIst(data.expires_at),
        updated_at_ist: formatIst(data.updated_at),
        files,
      };
      if (data.content_updated_at !== undefined) {
        values.content_updated_at_ist = formatIst(data.content_updated_at);
      }
      batch.set(doc.ref, values, { merge: true });
    }

    await batch.commit();
    updated += snapshot.size;
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < 400) break;
  }

  console.log(`Added human-readable IST fields to ${updated} BlinkPad document(s).`);
  await app.delete();
}

main().catch((error) => {
  console.error('IST timestamp backfill failed:', error);
  process.exitCode = 1;
});
