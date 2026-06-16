import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { PlayerRecord, RoomRecord } from '@abc/shared';

export function useRoom(roomId: string | null) {
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerRecord>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    const unsubRoom = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
      setRoom(snap.exists() ? (snap.data() as RoomRecord) : null);
      setLoading(false);
    });

    const unsubPlayers = onSnapshot(collection(db, 'rooms', roomId, 'players'), (snap) => {
      const map: Record<string, PlayerRecord> = {};
      snap.forEach((d) => (map[d.id] = d.data() as PlayerRecord));
      setPlayers(map);
    });

    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomId]);

  return { room, players, loading };
}
