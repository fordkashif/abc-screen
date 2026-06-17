import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import { resetRoomForReplay } from './firebase/roomService';
import type { RoomRecord, PlayerRecord } from '@abc/shared';
import backgroundLoop from './assets/loop.ogg';

const ScreenHome = lazy(() => import('./screens/ScreenHome').then(module => ({ default: module.ScreenHome })));
const ScreenLobby = lazy(() => import('./screens/ScreenLobby').then(module => ({ default: module.ScreenLobby })));
const ScreenGameplay = lazy(() => import('./screens/ScreenGameplay').then(module => ({ default: module.ScreenGameplay })));
const ScreenResults = lazy(() => import('./screens/ScreenResults').then(module => ({ default: module.ScreenResults })));
const ScreenSummary = lazy(() => import('./screens/ScreenSummary').then(module => ({ default: module.ScreenSummary })));

type StoredScreenSession = {
  roomId: string;
  roomCode: string;
};

const SCREEN_SESSION_KEY = 'abc-screen-session';

function readStoredSession(): StoredScreenSession | null {
  try {
    const raw = localStorage.getItem(SCREEN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredScreenSession>;
    if (!parsed.roomId || !parsed.roomCode) return null;
    return { roomId: parsed.roomId, roomCode: parsed.roomCode };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredScreenSession) {
  localStorage.setItem(SCREEN_SESSION_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  localStorage.removeItem(SCREEN_SESSION_KEY);
}

function readScaleOverride(): number | null {
  const raw = new URLSearchParams(window.location.search).get('scale');
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(1.25, Math.max(0.55, parsed));
}

function calculateScreenScale(): number {
  const override = readScaleOverride();
  if (override) return override;

  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;

  return Math.min(1, width / 1600, height / 900);
}

function useScreenScale() {
  const [scale, setScale] = useState(() => calculateScreenScale());

  useEffect(() => {
    function updateScale() {
      setScale(calculateScreenScale());
    }

    updateScale();
    window.addEventListener('resize', updateScale);
    window.visualViewport?.addEventListener('resize', updateScale);

    return () => {
      window.removeEventListener('resize', updateScale);
      window.visualViewport?.removeEventListener('resize', updateScale);
    };
  }, []);

  return scale;
}

export default function App() {
  const storedSession = readStoredSession();
  const [hostId, setHostId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(storedSession?.roomId ?? null);
  const [roomCode, setRoomCode] = useState(storedSession?.roomCode ?? '');
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerRecord>>({});
  const [roomResolved, setRoomResolved] = useState(() => storedSession ? false : true);
  const screenScale = useScreenScale();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, u => setHostId(u?.uid ?? null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let bootTimer: number | null = null;

    const ensureAudio = () => {
      if (audioRef.current) return audioRef.current;
      const audio = new Audio(backgroundLoop);
      audio.loop = true;
      audio.preload = 'metadata';
      audio.volume = 0.22;
      audioRef.current = audio;
      return audio;
    };

    const tryPlay = () => {
      const audio = ensureAudio();
      void audio.play().catch(() => {});
    };

    const resumeIfPaused = () => {
      const audio = audioRef.current;
      if (!document.hidden && audio && audio.paused) {
        tryPlay();
      }
    };

    const bootAudio = () => {
      if (cancelled) return;
      tryPlay();
    };

    bootTimer = window.setTimeout(bootAudio, 900);

    window.addEventListener('pointerdown', tryPlay, { passive: true });
    window.addEventListener('keydown', tryPlay);
    document.addEventListener('visibilitychange', resumeIfPaused);

    return () => {
      cancelled = true;
      if (bootTimer !== null) {
        window.clearTimeout(bootTimer);
      }
      window.removeEventListener('pointerdown', tryPlay);
      window.removeEventListener('keydown', tryPlay);
      document.removeEventListener('visibilitychange', resumeIfPaused);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    setRoomResolved(!roomId);
    if (!roomId) return;
    const u1 = onSnapshot(doc(db, 'rooms', roomId), s =>
      {
        setRoomResolved(true);
        setRoom(s.exists() ? (s.data() as RoomRecord) : null);
      },
    );
    const u2 = onSnapshot(collection(db, 'rooms', roomId, 'players'), s => {
      const m: Record<string, PlayerRecord> = {};
      s.forEach(d => (m[d.id] = d.data() as PlayerRecord));
      setPlayers(m);
    });
    return () => { u1(); u2(); };
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !roomResolved || room) return;
    clearStoredSession();
    setRoomId(null);
    setRoomCode('');
    setPlayers({});
  }, [roomId, roomResolved, room]);

  function handleCreated(id: string, code: string) {
    setRoomResolved(false);
    setRoomId(id);
    setRoomCode(code);
    writeStoredSession({ roomId: id, roomCode: code });
  }

  async function handlePlayAgain() {
    if (!roomId || !hostId) return;
    await resetRoomForReplay(roomId, hostId);
  }

  function handleBackHome() {
    clearStoredSession();
    setRoomId(null);
    setRoomCode('');
    setRoom(null);
    setPlayers({});
  }

  let screen: React.ReactNode;
  const loadingFallback = <div className="loading-screen">Loading...</div>;

  if (!hostId || (roomId && !roomResolved)) {
    screen = loadingFallback;
  } else if (!roomId || !room) {
    screen = (
      <Suspense fallback={loadingFallback}>
        <ScreenHome hostId={hostId} onCreated={handleCreated} />
      </Suspense>
    );
  } else if (room.status === 'waiting') {
    screen = (
      <Suspense fallback={loadingFallback}>
        <ScreenLobby room={room} players={players} roomCode={roomCode} />
      </Suspense>
    );
  } else if (room.status === 'playing' || room.status === 'paused') {
    screen = (
      <Suspense fallback={loadingFallback}>
        <ScreenGameplay room={room} players={players} />
      </Suspense>
    );
  } else if (room.status === 'round_ended') {
    screen = (
      <Suspense fallback={loadingFallback}>
        <ScreenResults room={room} players={players} />
      </Suspense>
    );
  } else if (room.status === 'finished') {
    screen = (
      <Suspense fallback={loadingFallback}>
        <ScreenSummary players={players} onPlayAgain={handlePlayAgain} onBackHome={handleBackHome} />
      </Suspense>
    );
  } else {
    screen = <div className="loading-screen">Unknown state</div>;
  }

  return (
    <div className="screen-scale-frame" style={{ '--screen-scale': screenScale } as React.CSSProperties}>
      <div className="screen-scale-stage">
        {screen}
      </div>
    </div>
  );
}
