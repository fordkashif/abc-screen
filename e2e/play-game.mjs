/**
 * Automated play test: one TV and two phones play a full 3-round game
 * against the real Firebase project, each in its own browser session (so each
 * is its own anonymous player).
 *
 * Checks:
 *  - phones join by code, the first one becomes dealer and can start
 *  - the fast-or-slow call: dealer picks a speed, the other phone hits STOP
 *  - answers score: unique 100, shared 50 each
 *  - the dealer role rotates each round
 *  - round 3 is played with the TV closed: the dealer's phone takes over
 *    refereeing, and the round still ends and gets scored
 *
 * Usage: node e2e/play-game.mjs <tvUrl> <phoneUrl>
 * Both apps must be running (CI serves the built apps with vite preview).
 */
import { chromium, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { collection, getDocs, getFirestore, limit, query, where } from 'firebase/firestore';

const [tvUrl = 'http://localhost:4173', phoneUrl = 'http://localhost:4174'] = process.argv.slice(2);
const STEP_TIMEOUT = 45_000;
const results = [];

function log(message) {
  console.log(`[play-test] ${message}`);
}

function check(condition, message) {
  results.push({ ok: !!condition, message });
  log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch();
const phoneDevice = devices['Pixel 7'];

async function newSession(name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT);
  page.on('pageerror', error => log(`${name} page error: ${error.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning' || msg.text().includes('[referee]')) log(`${name} console ${msg.type()}: ${msg.text().slice(0, 240)}`);
  });
  return { name, context, page };
}

async function joinPhone(phone, code, playerName) {
  const { page } = phone;
  await page.goto(`${phoneUrl}/?code=${code}`);
  await page.getByRole('button', { name: /CONTINUE/ }).click();
  await page.getByPlaceholder('Enter your name').fill(playerName);
  await page.getByRole('button', { name: 'Cat' }).click();
  await page.getByRole('button', { name: /JOIN GAME/ }).click();
  await page.waitForSelector('.waitroom-phone');
  log(`${playerName} joined`);
}

async function isDealer(phone) {
  return phone.page.locator('.calling-speed-button').first().isVisible().catch(() => false);
}

/** Runs the fast-or-slow call; returns the round letter. */
async function callLetter(dealer, stopper, speed) {
  await dealer.page.locator(`.calling-speed-button.${speed}`).waitFor();
  await dealer.page.locator(`.calling-speed-button.${speed}`).click();
  log(`${dealer.name} called ${speed.toUpperCase()}`);
  const stop = stopper.page.locator('.calling-stop-button.live:not([disabled])');
  await stop.waitFor();
  await stopper.page.waitForTimeout(speed === 'slow' ? 1_400 : 600);
  // The live STOP button pulses non-stop, so it never looks "still" to Playwright.
  await stop.click({ force: true });
  log(`${stopper.name} hit STOP`);
  const letter = (await dealer.page.locator('.controller-play-letter').textContent()).trim();
  check(/^[A-Z]$/.test(letter), `round letter is a single letter (${letter})`);
  return letter;
}

async function answerAndSubmit(phone, answers) {
  const { page } = phone;
  const inputs = page.locator('.controller-play-input');
  await page.locator('.controller-play-input:not([disabled])').first().waitFor(); // countdown over
  for (const [index, value] of Object.entries(answers)) {
    await inputs.nth(Number(index)).fill(value);
  }
  await page.locator('.controller-play-submit').click();
}

/** The player's running total on the results screen (dealer: score card; others: their leaderboard row). */
async function totalScore(phone) {
  const dealerTotal = phone.page.locator('.controller-results-score-total');
  const myRow = phone.page.locator('.controller-results-leaderboard-row.me .controller-results-leaderboard-score');
  await dealerTotal.or(myRow).first().waitFor({ timeout: 90_000 });
  const text = (await dealerTotal.isVisible()) ? await dealerTotal.textContent() : await myRow.first().textContent();
  return Number(text.replace(/[^0-9]/g, ''));
}

async function advance(dealer) {
  const button = dealer.page.locator('.controller-results-next-button');
  for (let i = 0; i < 6; i += 1) {
    const label = (await button.textContent()).trim();
    await button.click();
    if (/Next Round|See Final Results/.test(label)) return;
    await dealer.page.waitForTimeout(300);
  }
  throw new Error('could not move past the results screen');
}

/** On failure: read the room straight from Firestore, to see whether the game or the screens got stuck. */
async function dumpRoom(code) {
  try {
    const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split('\n').map(line => line.match(/^(VITE_[A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
    const app = initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }, 'diagnostics');
    await signInAnonymously(getAuth(app));
    const db = getFirestore(app);
    const rooms = await getDocs(query(collection(db, 'rooms'), where('code', '==', code), limit(1)));
    if (rooms.empty) return log(`DIAG room ${code} not found`);
    const room = rooms.docs[0];
    const r = room.data();
    const ms = t => (t?.toMillis ? `${Math.round((Date.now() - t.toMillis()) / 1000)}s ago` : String(t));
    log(`DIAG room status=${r.status} round=${r.roundNumber} letter=${r.currentLetter} dealer=${r.currentDealerId?.slice(0, 6)} host=${r.hostId?.slice(0, 6)} hostSeen=${ms(r.hostSeenAt)} started=${ms(r.roundStartedAt)} closeReq=${ms(r.roundCloseRequestedAt)} call=${JSON.stringify({ speed: r.letterCall?.speed, by: r.letterCall?.stoppedBy?.slice?.(0, 6), letter: r.letterCall?.letter })}`);
    const players = await getDocs(collection(db, 'rooms', room.id, 'players'));
    log(`DIAG players ${players.docs.map(d => { const p = d.data(); return `${p.name}(${d.id.slice(0, 6)}) submitted=${p.submitted} answersRound=${p.answersRound} score=${p.score} scoredRound=${p.scoredRound} seen=${ms(p.lastSeenAt)} answers=${JSON.stringify(p.answers)}`; }).join(' ; ')}`);
  } catch (error) {
    log(`DIAG could not read the room: ${error.message}`);
  }
}

async function dumpScreens(sessions) {
  for (const { name, page, context } of sessions) {
    try {
      if (page.isClosed()) continue;
      const text = (await page.locator('body').innerText({ timeout: 3_000 })).replace(/\s+/g, ' ').slice(0, 220);
      log(`DIAG ${name} screen: ${text}`);
      const referee = await page.evaluate(() => globalThis.__abcReferee ?? null).catch(() => null);
      if (referee) log(`DIAG ${name} referee: ${JSON.stringify({ ...referee, ageMs: Date.now() - referee.at })}`);
    } catch { /* closed */ }
    void context;
  }
}

let exitCode = 0;
let roomCode = '';
let sessions = [];
try {
  const tv = await newSession('TV', { viewport: { width: 1600, height: 900 } });
  const ana = await newSession('Ana', { ...phoneDevice });
  const ben = await newSession('Ben', { ...phoneDevice });
  sessions = [tv, ana, ben];

  // TV creates a 3-round game.
  await tv.page.goto(tvUrl);
  await tv.page.getByRole('button', { name: /Set Up Game/ }).click();
  await tv.page.getByRole('group', { name: 'Rounds' }).getByRole('button', { name: '3' }).click();
  await tv.page.getByRole('group', { name: 'Timer' }).getByRole('button', { name: /^60/ }).click();
  await tv.page.getByRole('button', { name: /START NEW GAME/ }).click();
  const codeLabel = await tv.page.locator('.lobby-room-code').getAttribute('aria-label');
  const code = codeLabel.replace('Room code ', '').trim();
  roomCode = code;
  check(/^[A-Z0-9]{6}$/.test(code), `TV created room ${code}`);

  // Phones join. The first to join becomes dealer and starts the game.
  await joinPhone(ana, code, 'Ana');
  await joinPhone(ben, code, 'Ben');
  const start = ana.page.getByRole('button', { name: 'START GAME' });
  await start.waitFor();
  check(await start.isEnabled(), 'first player is dealer and can start with 2 players');
  await start.click();

  // ── Round 1: Ana deals (FAST), Ben hits STOP ──
  await tv.page.locator('.calling-stage').waitFor();
  check(true, 'TV shows the fast-or-slow call');
  check(await isDealer(ana), 'Ana (dealer) sees FAST and SLOW');
  let letter = await callLetter(ana, ben, 'fast');
  await answerAndSubmit(ana, { 0: `${letter}ex`, 1: `${letter}ola` }); // boy shared, girl unique
  await answerAndSubmit(ben, { 0: `${letter}ex`, 2: 'Zzzz' }); // boy shared, animal junk
  check((await totalScore(ana)) === 150, 'round 1: Ana scores 150 (shared 50 + unique 100)');
  check((await totalScore(ben)) === 50, 'round 1: Ben scores 50 (shared answer only; junk and wrong letter ignored)');
  await advance(ana);

  // ── Round 2: dealer rotates to Ben (SLOW), Ana hits STOP ──
  await ben.page.locator('.calling-speed-button').first().waitFor();
  check(await isDealer(ben), 'dealer rotated to Ben for round 2');
  letter = await callLetter(ben, ana, 'slow');
  await answerAndSubmit(ana, { 2: `${letter}abbit` });
  await answerAndSubmit(ben, { 3: `${letter}ville`, 4: `${letter}ruit` });
  check((await totalScore(ana)) === 250, 'round 2: Ana +100, total 250');
  check((await totalScore(ben)) === 250, 'round 2: Ben +200, total 250');
  await advance(ben);

  // ── Round 3: TV closes. Ana deals and her phone referees. ──
  await ana.page.locator('.calling-speed-button').first().waitFor();
  check(await isDealer(ana), 'dealer rotated back to Ana for round 3');
  await tv.context.close();
  log('TV closed; waiting for the dealer phone to take over refereeing');
  letter = await callLetter(ana, ben, 'fast');
  await answerAndSubmit(ana, { 5: `${letter}hing` });
  await answerAndSubmit(ben, { 5: `${letter}ool` });
  check((await totalScore(ana)) === 350, 'round 3 (TV closed): Ana +100, total 350, scored by her phone');
  check((await totalScore(ben)) === 350, 'round 3 (TV closed): Ben +100, total 350');
  await advance(ana);

  // Final scores: Ana 150+100+100 = 350, Ben 50+200+100 = 350.
  await ana.page.locator('.controller-summary').waitFor({ timeout: 60_000 });
  await ben.page.locator('.controller-summary').waitFor({ timeout: 60_000 });
  const summary = await ana.page.locator('.controller-summary').textContent();
  check(summary.includes('350'), 'game finished; both phones show the final scores (350 each)');
} catch (error) {
  exitCode = 1;
  // Keep the first lines of Playwright's message: they name the step and the element.
  const detail = String(error.message).split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4).join(' | ');
  log(`FAILED: ${detail}`);
  await dumpScreens(sessions);
  if (roomCode) await dumpRoom(roomCode);
} finally {
  await browser.close();
  const passed = results.filter(r => r.ok).length;
  log(`${passed}/${results.length} checks passed${exitCode ? ' before a failure' : ''}`);
  process.exit(exitCode);
}
