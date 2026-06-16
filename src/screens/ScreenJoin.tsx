import React, { useState } from 'react';
import { findRoomIdByCode } from '../firebase/roomLookup';

type Props = { onJoin: (roomId: string, code: string) => void };

export function ScreenJoin({ onJoin }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    if (code.trim().length < 4) return;
    setLoading(true);
    setError('');
    const roomId = await findRoomIdByCode(code);
    if (!roomId) {
      setError('Room not found. Check the code and try again.');
      setLoading(false);
      return;
    }
    onJoin(roomId, code.toUpperCase().trim());
  }

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-logo">ABC</div>
        <p className="join-sub">Fast or Slow — Big Screen</p>
        <input
          className="join-input"
          placeholder="Enter room code"
          value={code}
          maxLength={8}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          autoFocus
        />
        {error && <p className="join-error">{error}</p>}
        <button className="join-btn" onClick={handleConnect} disabled={loading || code.length < 4}>
          {loading ? 'Connecting…' : 'Connect to Room'}
        </button>
        <p className="join-hint">Open ABC on your phone and create a room, then enter the code here.</p>
      </div>
    </div>
  );
}
