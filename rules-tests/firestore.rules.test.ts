/**
 * Tests for firestore.rules. Each "allowed" test makes the same write the TV
 * or phone app makes; each "blocked" test is something the rules must stop.
 *
 * Needs the Firestore emulator (Java). From the abc-screen folder:
 *   npm run test:rules
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import {
  chooseCallSpeed,
  EMPTY_LETTER_CALL,
  stopLetterCall,
} from '../shared/src/letterCall';
import { scoreRoundOnServer } from '../shared/src/referee';

const ROOM = 'room1';
const HOST = 'tv';
const DEALER = 'alice';
const PLAYER = 'bob';
const OUTSIDER = 'mallory';
const EMPTY = { boy: '', girl: '', animal: '', place: '', food: '', thing: '' };

let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const room = (db: Firestore) => doc(db, 'rooms', ROOM);
const player = (db: Firestore, id: string) => doc(db, 'rooms', ROOM, 'players', id);

function playerData(id: string, extra: Record<string, unknown> = {}) {
  return {
    name: id, avatarId: 'cat', score: 0, isDealer: id === DEALER, submitted: false,
    joinedAt: Timestamp.fromMillis(id === DEALER ? 1 : 2), lastSeenAt: Timestamp.now(),
    connectionState: 'lobby', ready: true, answers: EMPTY, answersRound: 0, ...extra,
  };
}

/** Seeds a room (bypassing rules) in the given state with the dealer and one player. */
async function seed(roomExtra: Record<string, unknown> = {}, players = [DEALER, PLAYER]) {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(room(db), {
      code: 'ABC123', status: 'waiting', hostId: HOST, currentDealerId: DEALER, currentLetter: '',
      roundNumber: 0, settings: { rounds: 3, timer: 60 }, letterHistory: [], answerOverrides: {},
      roundStartedAt: null, createdAt: Timestamp.now(), letterCall: EMPTY_LETTER_CALL, ...roomExtra,
    });
    for (const id of players) await setDoc(player(db, id), playerData(id));
  });
}

const playing = { status: 'playing', roundNumber: 1, currentLetter: 'K', roundStartedAt: Timestamp.now() };

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-abc-rules',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe('TV (host)', () => {
  test('creates a room', async () => {
    await assertSucceeds(setDoc(doc(as(HOST), 'rooms', 'new'), {
      code: 'XYZ789', status: 'waiting', hostId: HOST, currentDealerId: '', currentLetter: '',
      roundNumber: 0, settings: { rounds: 3, timer: 60 }, letterHistory: [], answerOverrides: {},
      roundStartedAt: serverTimestamp(), createdAt: serverTimestamp(),
    }));
  });

  test('blocked: creating a room for someone else', async () => {
    await assertFails(setDoc(doc(as(HOST), 'rooms', 'new'), { code: 'X', status: 'waiting', hostId: 'other' }));
  });

  test('heartbeat, referee and play again', async () => {
    await seed(playing);
    const db = as(HOST);
    await assertSucceeds(updateDoc(room(db), { hostSeenAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(room(db), { roundCloseRequestedAt: serverTimestamp() }));
    await assertSucceeds(scoreRoundOnServer(db, ROOM, 1, 'playing', true));
    const batch = writeBatch(db);
    batch.update(player(db, PLAYER), { score: 0, answers: EMPTY, submitted: false, lastSeenAt: serverTimestamp() });
    batch.update(room(db), { status: 'waiting', roundNumber: 0 });
    await assertSucceeds(batch.commit());
  });

  test('blocked: changing the room code', async () => {
    await seed();
    await assertFails(updateDoc(room(as(HOST)), { code: 'HACKED' }));
  });
});

describe('joining and leaving', () => {
  test('first player joins an empty room and becomes dealer', async () => {
    await seed({ currentDealerId: '' }, []);
    const db = as(DEALER);
    await assertSucceeds(runTransaction(db, async tx => {
      await tx.get(room(db));
      await tx.get(player(db, DEALER));
      tx.set(player(db, DEALER), {
        name: 'alice', avatarId: 'cat', score: 0, isDealer: true, submitted: false,
        joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), connectionState: 'lobby', ready: true,
      });
      tx.update(room(db), { currentDealerId: DEALER });
    }));
  });

  test('blocked: joining as someone else, or with points', async () => {
    await seed({}, [DEALER]);
    await assertFails(setDoc(player(as(PLAYER), 'carol'), { name: 'carol', score: 0, submitted: false }));
    await assertFails(setDoc(player(as(PLAYER), PLAYER), { name: 'bob', score: 500, submitted: false }));
  });

  test('blocked: joining a game in progress', async () => {
    await seed(playing, [DEALER]);
    await assertFails(setDoc(player(as(PLAYER), PLAYER), { name: 'bob', score: 0, submitted: false }));
  });

  test('rejoins, heartbeats and leaves', async () => {
    await seed(playing);
    const db = as(PLAYER);
    await assertSucceeds(updateDoc(player(db, PLAYER), {
      name: 'bob', avatarId: 'dog', lastSeenAt: serverTimestamp(), leftAt: deleteField(), connectionState: 'playing',
    }));
    await assertSucceeds(updateDoc(player(db, PLAYER), { lastSeenAt: serverTimestamp() }));
    await assertSucceeds(getDoc(player(db, PLAYER)));
    await assertSucceeds(runTransaction(db, async tx => {
      await tx.get(room(db));
      tx.update(player(db, PLAYER), { leftAt: serverTimestamp(), connectionState: 'left', lastSeenAt: serverTimestamp(), isDealer: false });
      tx.update(room(db), { status: 'finished' });
    }));
    await assertSucceeds(deleteDoc(player(db, PLAYER)));
  });

  test('dealer leaving hands the role to another player', async () => {
    await seed(playing, [DEALER, PLAYER, 'carol']);
    const db = as(DEALER);
    await assertSucceeds(runTransaction(db, async tx => {
      await tx.get(room(db));
      tx.update(player(db, DEALER), { leftAt: serverTimestamp(), connectionState: 'left', isDealer: false });
      tx.update(room(db), { currentDealerId: PLAYER });
      tx.update(player(db, PLAYER), { isDealer: true });
    }));
  });
});

describe('dealer', () => {
  test('starts the game with the fast-or-slow call', async () => {
    await seed();
    const db = as(DEALER);
    const batch = writeBatch(db);
    for (const id of [DEALER, PLAYER]) {
      batch.update(player(db, id), {
        submitted: false, answers: EMPTY, answersRound: 1, roundScore: 0, scoredRound: 0, ready: true, connectionState: 'playing',
      });
    }
    batch.update(room(db), {
      status: 'calling', currentDealerId: DEALER, currentLetter: '', letterHistory: [], letterCall: EMPTY_LETTER_CALL,
      answerOverrides: {}, roundCloseRequestedAt: null, roundNumber: 1, roundStartedAt: null, pausedRemainingSec: null,
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(chooseCallSpeed(db, ROOM, 1, 'slow'));
  });

  test('pauses, approves an answer and scores', async () => {
    await seed({ ...playing, status: 'round_ended' });
    const db = as(DEALER);
    await assertSucceeds(updateDoc(room(db), { [`answerOverrides.${PLAYER}:boy`]: true }));
    await assertSucceeds(scoreRoundOnServer(db, ROOM, 1, 'round_ended', false));
  });

  test('blocked: filling in another player\'s answers', async () => {
    await seed(playing);
    await assertFails(updateDoc(player(as(DEALER), PLAYER), { answers: { ...EMPTY, boy: 'Kevin' }, answersRound: 1 }));
  });

  test('blocked: faking the TV heartbeat', async () => {
    await seed();
    await assertFails(updateDoc(room(as(DEALER)), { hostSeenAt: serverTimestamp() }));
  });
});

describe('players', () => {
  test('hit STOP and the round starts', async () => {
    await seed({
      status: 'calling', roundNumber: 1,
      letterCall: { ...EMPTY_LETTER_CALL, speed: 'fast', startedAt: Timestamp.fromMillis(Date.now() - 2_000) },
    });
    const letter = await assertSucceeds(stopLetterCall(as(PLAYER), ROOM, 1, PLAYER, Date.now()));
    if (!letter) throw new Error('STOP did not pick a letter');
  });

  test('blocked: hitting STOP in someone else\'s name', async () => {
    await seed({
      status: 'calling', roundNumber: 1,
      letterCall: { ...EMPTY_LETTER_CALL, speed: 'fast', startedAt: Timestamp.fromMillis(Date.now() - 2_000) },
    });
    await assertFails(updateDoc(room(as(PLAYER)), {
      status: 'playing', currentLetter: 'Q', letterCall: { speed: 'fast', startedAt: null, stoppedBy: DEALER, letter: 'Q' },
    }));
  });

  test('autosave and submit while the round is open', async () => {
    await seed(playing);
    const db = as(PLAYER);
    await assertSucceeds(updateDoc(player(db, PLAYER), { answers: { ...EMPTY, boy: 'Kevin' }, answersRound: 1 }));
    await assertSucceeds(updateDoc(player(db, PLAYER), { answers: { ...EMPTY, boy: 'Kevin' }, answersRound: 1, submitted: true }));
  });

  test('blocked: changing answers after the round is scored', async () => {
    await seed({ ...playing, status: 'round_ended' });
    await assertFails(updateDoc(player(as(PLAYER), PLAYER), { answers: { ...EMPTY, boy: 'Kevin' }, answersRound: 1 }));
  });

  test('blocked: giving yourself points', async () => {
    await seed(playing);
    await assertFails(updateDoc(player(as(PLAYER), PLAYER), { score: 9999 }));
  });

  test('blocked: approving answers or ending the round as a non-dealer', async () => {
    await seed({ ...playing, status: 'round_ended' });
    const db = as(PLAYER);
    await assertFails(updateDoc(room(db), { [`answerOverrides.${PLAYER}:boy`]: true }));
    await assertFails(scoreRoundOnServer(db, ROOM, 1, 'round_ended', false));
    await assertFails(updateDoc(room(db), { status: 'round_ended' }));
  });

  test('takes over as dealer when the dealer is gone (fallback referee)', async () => {
    await seed(playing);
    const db = as(PLAYER);
    await assertSucceeds(runTransaction(db, async tx => {
      await tx.get(room(db));
      await tx.get(player(db, PLAYER));
      await tx.get(player(db, DEALER));
      tx.update(room(db), { currentDealerId: PLAYER });
      tx.update(player(db, PLAYER), { isDealer: true });
      tx.update(player(db, DEALER), { isDealer: false });
    }));
  });

  test('blocked: handing the dealer role to someone else', async () => {
    await seed(playing, [DEALER, PLAYER, 'carol']);
    await assertFails(updateDoc(room(as(PLAYER)), { currentDealerId: 'carol' }));
  });
});

describe('outsiders', () => {
  test('blocked: anyone not in the room', async () => {
    await seed(playing);
    const db = as(OUTSIDER);
    await assertFails(updateDoc(room(db), { status: 'finished' }));
    await assertFails(updateDoc(player(db, PLAYER), { answers: EMPTY, submitted: false }));
    await assertFails(deleteDoc(player(db, PLAYER)));
  });

  test('blocked: signed out', async () => {
    await seed();
    const db = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(getDoc(room(db)));
  });

  test('blocked: other collections', async () => {
    await assertFails(setDoc(doc(as(PLAYER), 'leaderboard', PLAYER), { score: 1 }));
  });
});
