import {
  addDoc, collection, doc, getDocs, serverTimestamp,
  updateDoc, writeBatch, runTransaction,
} from 'firebase/firestore';
import { db } from './config';
import {
  selectNextLetter, normalizeAnswer, isValidCategoryAnswer,
  isObviousGarbageAnswer, answerReviewKey, pointsForCount,
  ANSWER_KEYS,
} from '@abc/shared';
import type { RoomRecord, PlayerRecord, AnswerCategory } from '@abc/shared';

const EMPTY_ANSWERS = { boy: '', girl: '', animal: '', place: '', food: '', thing: '' };

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function createRoom(
  hostId: string,
  settings: { rounds: number; timer: number },
): Promise<{ roomId: string; code: string }> {
  const code = generateCode();
  const roomRef = await addDoc(collection(db, 'rooms'), {
    code,
    status: 'waiting',
    hostId,
    currentDealerId: hostId,
    currentLetter: '',
    roundNumber: 0,
    settings,
    letterHistory: [],
    answerOverrides: {},
    roundStartedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return { roomId: roomRef.id, code };
}

export async function startRoom(roomId: string, hostId: string): Promise<void> {
  const firstLetter = selectNextLetter([], 0);
  const roomRef = doc(db, 'rooms', roomId);
  const playersSnap = await getDocs(collection(db, `rooms/${roomId}/players`));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef);
    if (!snap.exists()) throw new Error('Room not found');
    const room = snap.data() as RoomRecord;
    if (room.status === 'playing' && room.currentLetter) return;
    tx.update(roomRef, {
      status: 'playing',
      currentDealerId: hostId,
      currentLetter: firstLetter,
      letterHistory: [firstLetter],
      answerOverrides: {},
      roundNumber: 1,
      roundStartedAt: serverTimestamp(),
    });
  });

  const batch = writeBatch(db);
  playersSnap.docs.forEach((p) =>
    batch.update(p.ref, {
      submitted: false,
      answers: EMPTY_ANSWERS,
      roundScore: 0,
      scoredRound: 0,
      roundReady: false,
      isDealer: false,
      connectionState: 'playing',
    }),
  );
  await batch.commit();
}

function isScoreableAnswer(
  room: RoomRecord,
  playerId: string,
  category: AnswerCategory,
  value: string,
): boolean {
  const override = room.answerOverrides?.[answerReviewKey(playerId, category)];
  if (override === true) return true;
  if (override === false) return false;
  if (isObviousGarbageAnswer(value)) return false;
  return isValidCategoryAnswer(category, value, room.currentLetter ?? '');
}

export async function finalizeRound(
  roomId: string,
  room: RoomRecord,
  players: Record<string, PlayerRecord>,
): Promise<void> {
  const targetLetter = (room.currentLetter ?? '').toUpperCase();
  const playerList = Object.entries(players);

  const counts: Record<string, number> = {};
  for (const key of ANSWER_KEYS) {
    for (const [id, player] of playerList) {
      const raw = player.answers?.[key]?.trim() ?? '';
      if (!raw || raw[0]?.toUpperCase() !== targetLetter) continue;
      if (!isScoreableAnswer(room, id, key, raw)) continue;
      const norm = `${key}:${normalizeAnswer(raw)}`;
      counts[norm] = (counts[norm] ?? 0) + 1;
    }
  }

  const batch = writeBatch(db);
  for (const [id, player] of playerList) {
    let roundScore = 0;
    for (const key of ANSWER_KEYS) {
      const raw = player.answers?.[key]?.trim() ?? '';
      if (!raw || raw[0]?.toUpperCase() !== targetLetter) continue;
      if (!isScoreableAnswer(room, id, key, raw)) continue;
      const sharedCount = counts[`${key}:${normalizeAnswer(raw)}`] ?? 1;
      roundScore += pointsForCount(sharedCount);
    }
    const prevRoundScore = player.scoredRound === room.roundNumber ? (player.roundScore ?? 0) : 0;
    const totalScore = Math.max(0, (player.score ?? 0) - prevRoundScore + roundScore);
    batch.update(doc(db, 'rooms', roomId, 'players', id), {
      score: totalScore,
      roundScore,
      scoredRound: room.roundNumber,
      roundReady: false,
    });
  }

  batch.update(doc(db, 'rooms', roomId), { status: 'round_ended' });
  await batch.commit();
}

export async function startNextRound(
  roomId: string,
  room: RoomRecord,
  hostId: string,
): Promise<{ finished: boolean }> {
  const nextRound = room.roundNumber + 1;
  const total = room.settings.rounds ?? 1;

  if (nextRound > total) {
    await updateDoc(doc(db, 'rooms', roomId), { status: 'finished' });
    return { finished: true };
  }

  const history = room.letterHistory ?? [];
  const letter = selectNextLetter(history, nextRound - 1);
  const playersSnap = await getDocs(collection(db, `rooms/${roomId}/players`));

  const batch = writeBatch(db);
  playersSnap.docs.forEach((p) =>
    batch.update(p.ref, {
      submitted: false,
      answers: EMPTY_ANSWERS,
      roundScore: 0,
      roundReady: false,
      connectionState: 'playing',
    }),
  );
  batch.update(doc(db, 'rooms', roomId), {
    status: 'playing',
    currentDealerId: hostId,
    roundNumber: nextRound,
    currentLetter: letter,
    letterHistory: [...history, letter],
    answerOverrides: {},
    roundStartedAt: serverTimestamp(),
  });
  await batch.commit();
  return { finished: false };
}

export async function setAnswerOverride(
  roomId: string,
  room: RoomRecord,
  players: Record<string, PlayerRecord>,
  playerId: string,
  category: AnswerCategory,
  approved: boolean,
): Promise<void> {
  const overrides = {
    ...(room.answerOverrides ?? {}),
    [answerReviewKey(playerId, category)]: approved,
  };
  await updateDoc(doc(db, 'rooms', roomId), { answerOverrides: overrides });
  await finalizeRound(roomId, { ...room, answerOverrides: overrides }, players);
}

function chooseReplayDealer(players: Array<{ id: string; data: PlayerRecord }>, fallbackId: string): string {
  if (players.length === 0) return fallbackId;

  return [...players].sort((a, b) => {
    const scoreDelta = (b.data.score ?? 0) - (a.data.score ?? 0);
    if (scoreDelta !== 0) return scoreDelta;

    const aJoined = a.data.joinedAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    const bJoined = b.data.joinedAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    return aJoined - bJoined;
  })[0].id;
}

export async function resetRoomForReplay(roomId: string, fallbackDealerId: string): Promise<void> {
  const playersSnap = await getDocs(collection(db, `rooms/${roomId}/players`));
  const playerRecords = playersSnap.docs.map((p) => ({ id: p.id, data: p.data() as PlayerRecord }));
  const dealerId = chooseReplayDealer(playerRecords, fallbackDealerId);
  const batch = writeBatch(db);

  playersSnap.docs.forEach((p) =>
    batch.update(p.ref, {
      ready: false,
      submitted: false,
      answers: EMPTY_ANSWERS,
      score: 0,
      roundScore: 0,
      scoredRound: 0,
      roundReady: false,
      isDealer: p.id === dealerId,
      connectionState: 'lobby',
      lastSeenAt: serverTimestamp(),
    }),
  );

  batch.update(doc(db, 'rooms', roomId), {
    status: 'waiting',
    currentDealerId: dealerId,
    currentLetter: '',
    roundNumber: 0,
    letterHistory: [],
    answerOverrides: {},
    roundStartedAt: serverTimestamp(),
  });

  await batch.commit();
}
