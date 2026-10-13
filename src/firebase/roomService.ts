import { addDoc, collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './config';
import type { PlayerRecord } from '@abc/shared';

// Round flow (start, scoring, next round) lives in the controller's roomActions.ts.

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
    // No dealer until a phone joins; the first player becomes the dealer.
    currentDealerId: '',
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
    pausedRemainingSec: null,
  });

  await batch.commit();
}
