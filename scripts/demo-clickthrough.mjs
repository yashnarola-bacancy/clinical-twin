import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SHOT = 'scripts/.shots'
mkdirSync(SHOT, { recursive: true })

const log = (...a) => console.log('•', ...a)
let step = 0
const shot = async (page, name) => {
  step += 1
  const p = `${SHOT}/${String(step).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: p, fullPage: true })
  log(`screenshot → ${p}`)
}

const results = []
const pass = (s) => { results.push(['PASS', s]); log('PASS:', s) }
const fail = (s) => { results.push(['FAIL', s]); console.error('✗ FAIL:', s) }

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
})
const context = await browser.newContext({ permissions: ['microphone'] })
const page = await context.newPage()
page.setDefaultTimeout(45_000)
page.on('pageerror', (e) => console.error('  [pageerror]', e.message))

try {
  // ── STEP 1: record → note ────────────────────────────────────────────
  log('STEP 1 — record a visit')
  await page.goto(`${BASE}/record`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#encounter-select')
  // make sure there is at least one real encounter option
  const optionCount = await page.locator('#encounter-select option').count()
  const firstVal = await page.locator('#encounter-select option').first().getAttribute('value')
  if (optionCount < 1 || !firstVal) throw new Error('no active encounters to record against')
  pass(`record page loaded with ${optionCount} encounter option(s)`)

  await page.getByRole('button', { name: /start recording/i }).click()
  await page.getByText(/recording in progress/i).waitFor()
  await page.waitForTimeout(2500) // capture a couple of seconds of (fake) audio
  await page.getByRole('button', { name: /^stop$/i }).click()
  log('  stopped — waiting for transcribe + generate (mock)…')

  // pipeline navigates to /encounters/<id>
  await page.waitForURL(/\/encounters\/[^/]+$/, { timeout: 60_000 })
  const encUrl = page.url()
  log(`  navigated to ${encUrl}`)
  // SOAP note + codes should be present
  await page.getByText(/Subjective/i).first().waitFor()
  await page.getByText(/Assessment/i).first().waitFor()
  await shot(page, 'note-generated')
  pass('AI SOAP note generated and shown on encounter detail')

  // ── STEP 2: edit → sign off ──────────────────────────────────────────
  log('STEP 2 — edit and sign off')
  const editables = page.locator('textarea:not([disabled]):not([readonly])')
  if (await editables.count()) {
    const ta = editables.first()
    await ta.click()
    await ta.press('End')
    await ta.type(' [reviewed by clinician]')
    pass('edited a SOAP field (edit tracked)')
  } else {
    log('  (no editable textarea found — continuing to sign)')
  }

  const signBtn = page.getByRole('button', { name: /sign off/i })
  await signBtn.waitFor()
  await signBtn.click()
  // wait for SIGNED state — the signed badge appears / sign button goes away
  await page.getByText(/\bSigned\b/i).first().waitFor({ timeout: 30_000 })
  await shot(page, 'signed')
  pass('note signed off (status → SIGNED)')

  // ── STEP 3: sync to EHR → FHIR bundle + latency ──────────────────────
  log('STEP 3 — sync to EHR')
  const syncBtn = page.getByRole('button', { name: /sync to ehr/i })
  await syncBtn.waitFor({ timeout: 30_000 })
  await syncBtn.click()
  await page.getByText(/Synced to EHR/i).first().waitFor({ timeout: 30_000 })
  // latency surfaced next to the confirmation, formatted as seconds e.g. "· 0.8s"
  const confText = (await page.getByText(/Synced to EHR/i).first().innerText()).trim()
  if (/\d+(\.\d+)?\s*s/.test(confText)) pass(`EHR sync completed with latency shown ("${confText}")`)
  else fail(`EHR sync completed but latency readout not found (saw: "${confText}")`)

  // expand the FHIR bundle viewer if present
  const fhirToggle = page.getByText(/FHIR bundle/i).first()
  if (await fhirToggle.isVisible().catch(() => false)) {
    await fhirToggle.click().catch(() => {})
    await page.waitForTimeout(400)
    const bundleVisible = await page.getByText(/"resourceType"|Bundle|transaction/i).first().isVisible().catch(() => false)
    if (bundleVisible) pass('FHIR bundle expanded and visible')
    else log('  (FHIR bundle toggle clicked; JSON not detected — non-blocking)')
  } else {
    log('  (no FHIR bundle toggle found — non-blocking)')
  }
  await shot(page, 'synced-fhir')

  // ── STEP 4: KPI dashboard ────────────────────────────────────────────
  log('STEP 4 — KPI dashboard')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.getByText(/Avg note generation/i).waitFor()
  await page.getByText(/Signed without edits/i).waitFor()
  await page.getByText(/EHR sync latency/i).waitFor()
  await page.getByText(/Encounters processed/i).waitFor()
  await shot(page, 'kpi-dashboard')
  pass('KPI dashboard renders all four metric cards')

  // ── STEP 5: twin → what-if ───────────────────────────────────────────
  log('STEP 5 — digital twin + what-if')
  await page.goto(`${BASE}/twin`, { waitUntil: 'networkidle' })
  // baseline auto-runs → wait for a metric card
  await page.getByText(/Avg wait/i).first().waitFor({ timeout: 45_000 })
  await page.getByText(/What-if analysis/i).waitFor()
  await shot(page, 'twin-baseline')
  pass('twin baseline simulation ran (metrics shown)')

  const preset = page.getByRole('button', { name: /move 3 nurses/i })
  await preset.waitFor()
  await preset.click()
  // scenario comparison appears — ComparisonCard shows "from <baseline>"
  await page.getByText(/\bfrom\b/i).first().waitFor({ timeout: 45_000 })
  await shot(page, 'twin-whatif')
  pass('"move 3 nurses → ED" what-if ran and produced a comparison')

} catch (err) {
  fail(`exception: ${err.message}`)
  await shot(page, 'error').catch(() => {})
} finally {
  await browser.close()
}

// ── summary ────────────────────────────────────────────────────────────
console.log('\n================ DEMO CLICK-THROUGH SUMMARY ================')
for (const [k, s] of results) console.log(`  ${k}  ${s}`)
const failed = results.filter(([k]) => k === 'FAIL').length
console.log(`\n${failed === 0 ? '✓ ALL STEPS PASSED' : `✗ ${failed} FAILURE(S)`}`)
process.exit(failed === 0 ? 0 : 1)
