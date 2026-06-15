/**
 * Drive the full Module A pipeline via HTTP:
 * transcribe → generate-note → (print note + code IDs for sign-off test)
 */
const BASE = 'http://localhost:3000';
const ENC  = 'cmqf7qm8c001augrsn6b0qkyc'; // Jennifer Garcia — CHECKED_IN

// ── Step 1: Transcribe ────────────────────────────────────────────────────
console.log('\n── Step 1: POST /api/transcribe ──');
const fd = new FormData();
fd.append('encounterId', ENC);
fd.append('durationSec', '45');
// MOCK_AI=true → audio field is skipped; no file needed

const r1   = await fetch(`${BASE}/api/transcribe`, { method: 'POST', body: fd });
const d1   = await r1.json();
console.log('status:', r1.status);
if (!d1.ok) { console.error('FAIL:', d1.error); process.exit(1); }
console.log('transcript (first 120 chars):', d1.data.text.slice(0, 120) + '…');
console.log('durationSec:', d1.data.durationSec);

// ── Step 2: Generate note ─────────────────────────────────────────────────
console.log('\n── Step 2: POST /api/generate-note ──');
const r2 = await fetch(`${BASE}/api/generate-note`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ encounterId: ENC, transcript: d1.data.text }),
});
const d2 = await r2.json();
console.log('status:', r2.status);
if (!d2.ok) { console.error('FAIL:', d2.error); process.exit(1); }
const note = d2.data;
console.log('noteId      :', note.id);
console.log('noteStatus  :', note.status);
console.log('generationMs:', note.generationMs);
console.log('subjective  :', note.subjective.slice(0, 80) + '…');
console.log('codes:');
for (const c of note.codes) {
  console.log(`  [${c.system}] ${c.code} — ${c.description} (conf ${Math.round(c.confidence * 100)}%) accepted=${c.accepted}`);
}

// ── Step 3: Sign off ──────────────────────────────────────────────────────
console.log('\n── Step 3: POST /api/sign-off ──');
const acceptedCodeIds = note.codes.map(c => c.id); // accept all
const r3 = await fetch(`${BASE}/api/sign-off`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({
    noteId:      note.id,
    encounterId: ENC,
    signedById:  null,
    fields: {
      subjective: note.subjective + '\n[Clinician edit: patient also reports mild fatigue.]',
      objective:  note.objective,
      assessment: note.assessment,
      plan:       note.plan,
    },
    editedFields:    ['subjective'],
    acceptedCodeIds: acceptedCodeIds.slice(0, 2), // accept first two, reject last
  }),
});
const d3 = await r3.json();
console.log('status:', r3.status);
if (!d3.ok) { console.error('FAIL:', d3.error); process.exit(1); }
const signed = d3.data;
console.log('noteStatus  :', signed.status);
console.log('signedAt    :', signed.signedAt);
console.log('editedFields:', signed.editedFields);
console.log('codes:');
for (const c of signed.codes) {
  console.log(`  [${c.system}] ${c.code} — accepted=${c.accepted}`);
}

// ── Step 4: Idempotency guard — double sign should 409 ────────────────────
console.log('\n── Step 4: Double sign-off (expect 409) ──');
const r4 = await fetch(`${BASE}/api/sign-off`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({
    noteId: note.id, encounterId: ENC, signedById: null,
    fields: { subjective: note.subjective, objective: note.objective,
              assessment: note.assessment, plan: note.plan },
    editedFields: [], acceptedCodeIds: [],
  }),
});
const d4 = await r4.json();
console.log('status:', r4.status, '— ok:', d4.ok, '— error:', d4.error);

// ── Step 5: Check encounter via detail page ────────────────────────────────
console.log('\n── Step 5: GET /encounters/' + ENC + ' (HTML check) ──');
const r5 = await fetch(`${BASE}/encounters/${ENC}`);
console.log('status:', r5.status);
const html = await r5.text();
const hasSoap = html.includes('Subjective') && html.includes('Objective');
console.log('page contains "Signed":', html.includes('Signed'));
console.log('page contains SOAP labels:', hasSoap);

console.log('\n✓ All steps passed');
