import React, { useEffect, useRef, useState } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import { createRoom, resetRoomForReplay } from './firebase/roomService';
import { ScreenHome } from './screens/ScreenHome';
import { ScreenLobby } from './screens/ScreenLobby';
import { ScreenGameplay } from './screens/ScreenGameplay';
import { ScreenResults } from './screens/ScreenResults';
import { ScreenSummary } from './screens/ScreenSummary';
import type { RoomRecord, PlayerRecord } from '@abc/shared';
import backgroundLoop from './assets/loop.ogg';

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
  const [hostId, setHostId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerRecord>>({});
  const screenScale = useScreenScale();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, u => setHostId(u?.uid ?? null));
  }, []);

  useEffect(() => {
    const audio = new Audio(backgroundLoop);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.22;
    audioRef.current = audio;

    const tryPlay = () => {
      void audio.play().catch(() => {});
    };

    const resumeIfPaused = () => {
      if (!document.hidden && audio.paused) {
        tryPlay();
      }
    };

    tryPlay();
    window.addEventListener('pointerdown', tryPlay, { passive: true });
    window.addEventListener('keydown', tryPlay);
    document.addEventListener('visibilitychange', resumeIfPaused);

    return () => {
      window.removeEventListener('pointerdown', tryPlay);
      window.removeEventListener('keydown', tryPlay);
      document.removeEventListener('visibilitychange', resumeIfPaused);
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const u1 = onSnapshot(doc(db, 'rooms', roomId), s =>
      setRoom(s.exists() ? (s.data() as RoomRecord) : null),
    );
    const u2 = onSnapshot(collection(db, 'rooms', roomId, 'players'), s => {
      const m: Record<string, PlayerRecord> = {};
      s.forEach(d => (m[d.id] = d.data() as PlayerRecord));
      setPlayers(m);
    });
    return () => { u1(); u2(); };
  }, [roomId]);

  function handleCreated(id: string, code: string) {
    setRoomId(id);
    setRoomCode(code);
  }

  async function handlePlayAgain() {
    if (!roomId || !hostId) return;
    await resetRoomForReplay(roomId, hostId);
  }

  function handleBackHome() {
    setRoomId(null);
    setRoomCode('');
    setRoom(null);
    setPlayers({});
  }

  let screen: React.ReactNode;

  if (!hostId) {
    screen = <div className="loading-screen">Loading...</div>;
  } else if (!roomId || !room) {
    screen = <ScreenHome hostId={hostId} onCreated={handleCreated} />;
  } else if (room.status === 'waiting') {
    screen = <ScreenLobby room={room} players={players} roomCode={roomCode} />;
  } else if (room.status === 'playing') {
    screen = <ScreenGameplay room={room} players={players} />;
  } else if (room.status === 'round_ended') {
    screen = <ScreenResults room={room} players={players} />;
  } else if (room.status === 'finished') {
    screen = <ScreenSummary players={players} onPlayAgain={handlePlayAgain} onBackHome={handleBackHome} />;
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
