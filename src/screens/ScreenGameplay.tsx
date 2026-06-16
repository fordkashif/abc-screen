import React, { useEffect, useRef, useState } from 'react';
import type { PlayerRecord, RoomRecord } from '@abc/shared';
import { ANSWER_KEYS, CATEGORY_LABELS } from '@abc/shared';
import abcLogo from '../assets/abc-logo.png';
import { PlayerAvatar } from '../utils/playerAvatar';

type Props = {
  room: RoomRecord;
  players: Record<string, PlayerRecord>;
};

export function ScreenGameplay({ room, players }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const prevLetter = useRef('');

  useEffect(() => {
    if (prevLetter.current !== room.currentLetter) {
      prevLetter.current = room.currentLetter;
      setElapsed(0);
    }
  }, [room.currentLetter]);

  useEffect(() => {
    const startMs = room.roundStartedAt?.toMillis() ?? Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startMs) / 1000)), 500);
    return () => clearInterval(id);
  }, [room.roundStartedAt]);

  const total = room.settings.timer;
  const timeLeft = Math.max(0, total - elapsed);
  const isUrgent = timeLeft <= 10;
  const progressDeg = Math.max(0, Math.min(360, (timeLeft / total) * 360));
  const playerList = Object.entries(players);
  const submitted = playerList.filter(([, p]) => p.submitted).length;
  const dealerEntry = playerList.find(([id]) => id === room.currentDealerId);
  const dealerName = dealerEntry?.[1]?.name ?? 'Dealer';

  return (
    <div className="gameplay-screen">
      <img className="gp-logo" src={abcLogo} alt="ABC" />

      <div className="gp-top-right">
        <div className="gp-submitted-pill">{submitted} / {playerList.length} submitted</div>
      </div>

      <div className="gp-round-pill">Round {room.roundNumber} of {room.settings.rounds}</div>

      <section className="gp-main-focus">
        <div className="gp-timer-zone">
          <div className={`gp-focus-timer ${isUrgent ? 'urgent' : ''}`} aria-label={`${timeLeft} seconds left`}>
            <div className="gp-timer-glow"></div>
            <div
              className="gp-timer-ring"
              style={{ '--progress': `${progressDeg}deg` } as React.CSSProperties}
            ></div>
            <div className="gp-timer-content">
              <div className="gp-timer-number">{timeLeft}</div>
              <div className="gp-focus-timer-label">Seconds Left</div>
            </div>
          </div>
        </div>

        <div className="gp-letter-zone">
          <div className="gp-letter-wrap">
            <span className="gp-letter-shadow"></span>
            <span className="gp-letter-flair gp-lf1"></span>
            <span className="gp-letter-flair gp-lf2"></span>
            <span className="gp-letter-flair gp-lf3"></span>
            <span className="gp-letter-flair gp-lf4"></span>
            <div className="gp-focus-letter" key={room.currentLetter}>{room.currentLetter}</div>
          </div>

          <div className="gp-dealer-note">
            <div className="gp-note-icon">!</div>
            <div>
              <p className="gp-note-title">{dealerName} will end the round</p>
              <p className="gp-note-copy">Be the fastest or slowest to think of something that starts with...</p>
            </div>
          </div>
        </div>

        <aside className="gp-players-mini">
          {playerList.slice(0, 4).map(([id, p]) => (
            <article key={id} className="gp-player-row">
              <PlayerAvatar player={p} className="gp-avatar" />
              <div>
                <h2 className="gp-player-name">{p.name}</h2>
                <p className="gp-player-status">
                  {id === room.currentDealerId ? 'Will end the round' : p.submitted ? 'Answer submitted' : 'Thinking...'}
                </p>
              </div>
              {id === room.currentDealerId ? (
                <div className="gp-dealer-label">Dealer</div>
              ) : p.submitted ? (
                <div className="gp-status-submitted"><span className="gp-small-check">✓</span> Submitted</div>
              ) : (
                <div className="gp-thinking-label">Thinking</div>
              )}
            </article>
          ))}
        </aside>
      </section>

      <section className="gp-categories-bar">
        <h2 className="gp-categories-title">Categories</h2>
        <div className="gp-category-list">
          {ANSWER_KEYS.map((k, index) => (
            <div key={k} className="gp-cat">
              <span className={`gp-cat-icon gp-cat-icon-${index}`}></span>
              {CATEGORY_LABELS[k]}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
