import React from 'react';
import QRCode from 'react-qr-code';
import type { PlayerRecord, RoomRecord } from '@abc/shared';
import abcLogo from '../assets/abc-logo.png';
import { avatarColor, PlayerAvatar } from '../utils/playerAvatar';

const CONTROLLER_URL = import.meta.env.VITE_CONTROLLER_URL ?? 'http://localhost:5174';

type Props = {
  room: RoomRecord;
  players: Record<string, PlayerRecord>;
  roomCode: string;
};

const STALE_MS = 35_000;

function isOnline(p: PlayerRecord): boolean {
  if (!p.lastSeenAt) return true;
  const ts = p.lastSeenAt as { toMillis: () => number };
  return Date.now() - ts.toMillis() < STALE_MS;
}

export function ScreenLobby({ room, players, roomCode }: Props) {
  const playerList = Object.entries(players);
  const onlineList = playerList.filter(([, p]) => isOnline(p));
  const dealerEntry = playerList.find(([id]) => id === room.currentDealerId);
  const dealerName = dealerEntry?.[1]?.name;
  const joinUrl = CONTROLLER_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const roomCodeLetters = roomCode.split('');

  return (
    <div className="lobby-screen">
      <aside className="lobby-sidebar lobby-glass">
        <div className="lobby-brand">
          <img className="lobby-logo-img" src={abcLogo} alt="ABC" />
          <p className="lobby-brand-subtitle">Fast or Slow</p>
        </div>

        <section className="lobby-join-card">
          <h2 className="lobby-section-title">Join on your phone</h2>
          <p className="lobby-instruction">Scan the QR code or go to</p>
          <div className="lobby-url-pill">
            <span className="lobby-globe">o</span>
            {joinUrl}
          </div>
          <div className="lobby-qr-box" aria-label="QR code to join">
            <QRCode
              value={`${CONTROLLER_URL}?code=${roomCode}`}
              size={166}
              bgColor="#ffffff"
              fgColor="#263244"
            />
          </div>
        </section>

        <section className="lobby-code-card">
          <h2 className="lobby-section-title">Room Code</h2>
          <div className="lobby-room-code" aria-label={`Room code ${roomCode}`}>
            {roomCodeLetters.map((letter, index) => (
              <span className="lobby-code-letter" key={`${letter}-${index}`}>{letter}</span>
            ))}
          </div>
          <p className="lobby-small-copy">
            Go to {joinUrl}<br />and enter the code
          </p>
        </section>

        <section className="lobby-waiting-card">
          <h2 className="lobby-waiting-title">
            {onlineList.length === 0 ? 'Waiting for players...' : `${onlineList.length} player${onlineList.length !== 1 ? 's' : ''} joined`}
          </h2>
          <div className="lobby-waiting-row">
            <div className="lobby-round-icon">
              <div className="lobby-avatar-stack" aria-label="Joined players">
                {onlineList.length === 0 ? (
                  <div className="screen-player-avatar lobby-avatar-empty">+</div>
                ) : (
                  onlineList.slice(0, 3).map(([id, p]) => (
                    <PlayerAvatar key={id} player={p} className="screen-player-avatar" size={34} />
                  ))
                )}
                {onlineList.length > 3 && (
                  <div className="screen-player-avatar lobby-avatar-more">+{onlineList.length - 3}</div>
                )}
              </div>
            </div>
            <p className="lobby-small-copy">Players join<br />with their phones</p>
            <div className="lobby-mini-qr">
              <QRCode
                value={`${CONTROLLER_URL}?code=${roomCode}`}
                size={34}
                bgColor="#ffffff"
                fgColor="#208900"
              />
            </div>
          </div>
        </section>
      </aside>

      <section className="lobby-main lobby-glass">
        <div className="lobby-top-glow"></div>
        <div className="lobby-bottom-glow"></div>

        <header className="lobby-header">
          <div>
            <h1 className="lobby-page-title">Players</h1>
            <p className="lobby-player-count">
              {onlineList.length} player{onlineList.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="lobby-status-pill"><span className="lobby-pulse"></span> Lobby open</div>
        </header>

        {onlineList.length === 0 ? (
          <div className="lobby-empty-state">
            <div className="lobby-empty-content">
              <div className="lobby-phone-orb">
                <div className="lobby-phone"></div>
                <div className="lobby-share-dot">+</div>
              </div>
              <h2 className="lobby-empty-title">No players yet!</h2>
              <p className="lobby-empty-copy">
                Scan the QR code or go to {joinUrl}<br />
                and enter the room code.
              </p>
            </div>
          </div>
        ) : (
          <div className="lobby-players-panel">
            <div className="lobby-player-grid">
              {onlineList.map(([id, p]) => (
                <article key={id} className="lobby-player-card" style={{ '--accent': avatarColor(p.name) } as React.CSSProperties}>
                  <PlayerAvatar player={p} className="screen-player-avatar" size={70} />
                  <h2 className="lobby-player-name">{p.name}</h2>
                  <p className="lobby-player-meta">{id === room.currentDealerId ? 'Host player' : 'Joined by phone'}</p>
                  <div className="lobby-ready-row"><span className="lobby-ready-dot"></span> Ready</div>
                </article>
              ))}
              {Array.from({ length: Math.max(0, 6 - onlineList.length) }).map((_, index) => (
                <div className="lobby-waiting-slot" key={index}>
                  Waiting for<br />player
                </div>
              ))}
            </div>

            <div className="lobby-host-bar">
              <p className="lobby-host-copy">
                {dealerName ? `${dealerName} will start the game from their phone.` : 'First to join becomes the dealer.'}
                <br />
                {room.settings.rounds} rounds - {room.settings.timer}s timer
              </p>
              <div className="lobby-host-status">Ready when everyone joins</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
