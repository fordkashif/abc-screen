import React, { useEffect, useState } from 'react';
import type { PlayerRecord, RoomRecord } from '@abc/shared';
import { callTicks, isCallRunning, serverNow } from '@abc/shared';
import abcLogo from '../assets/optimized/abc-logo.webp';

type Props = {
  room: RoomRecord;
  players: Record<string, PlayerRecord>;
};

/**
 * The fast-or-slow call on the TV. The letter stays hidden: the card flips
 * on every beat at the dealer's speed until a player hits STOP on their phone.
 */
export function ScreenCalling({ room, players }: Props) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), 50);
    return () => window.clearInterval(id);
  }, []);

  const call = room.letterCall;
  const speed = call?.speed ?? null;
  const running = isCallRunning(call, now);
  const ticks = call ? callTicks(call, now) : 0;
  const dealerName = players[room.currentDealerId]?.name ?? 'The dealer';
  const leadLeft = Math.max(0, Math.ceil(((call?.startedAt?.toMillis?.() ?? 0) - now) / 1000));

  const kicker = !speed ? `${dealerName} is the caller` : `${dealerName} called ${speed.toUpperCase()}`;
  const title = !speed ? 'Fast or slow?' : running ? 'Shout STOP on your phone!' : `Starting in ${leadLeft}`;
  const copy = !speed
    ? `${dealerName} is choosing how fast to run the alphabet.`
    : 'The alphabet is running in secret. The first STOP picks the letter.';

  return (
    <div className="gameplay-screen calling-screen">
      <img className="gp-logo" src={abcLogo} alt="ABC" />
      <div className="gp-round-pill">Round {room.roundNumber} of {room.settings.rounds}</div>

      <section className="gp-state-banner" aria-live="polite">
        <div className="gp-state-kicker">{kicker}</div>
        <div className="gp-state-title">{title}</div>
        <p className="gp-state-copy">{copy}</p>
      </section>

      <div className="calling-stage" aria-hidden="true">
        <div
          key={running ? ticks : 'idle'}
          className={`calling-card ${speed ?? 'idle'} ${running ? 'running' : ''}`}
        >
          ?
        </div>
        <div className="gp-letter-shadow calling-card-shadow" />
      </div>
    </div>
  );
}
