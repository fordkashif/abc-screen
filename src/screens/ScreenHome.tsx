import React, { useState } from 'react';
import { createRoom } from '../firebase/roomService';
import abcLogo from '../assets/optimized/abc-logo.webp';

type Props = { hostId: string; onCreated: (roomId: string, code: string) => void };

const ROUND_OPTIONS = [3, 5, 7, 10];
const TIMER_OPTIONS = [30, 60, 90];
const CREATE_ROOM_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('create-room-timeout'));
    }, timeoutMs);

    promise.then(
      value => {
        window.clearTimeout(timer);
        resolve(value);
      },
      error => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function ScreenHome({ hostId, onCreated }: Props) {
  const [screen, setScreen] = useState<'welcome' | 'setup'>('welcome');
  const [rounds, setRounds] = useState(5);
  const [timer, setTimer] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleStart() {
    setLoading(true);
    setError('');
    try {
      const { roomId, code } = await withTimeout(
        createRoom(hostId, { rounds, timer }),
        CREATE_ROOM_TIMEOUT_MS,
      );
      onCreated(roomId, code);
    } catch (e) {
      console.error('Failed to create room', e);
      setError('Could not create room. Check Firebase Auth domains and Firestore rules.');
      setLoading(false);
    }
  }

  if (screen === 'welcome') {
    return (
      <div className="home-screen home-screen-welcome">
        <section className="home-hero">
          <div className="home-hero-copy">
            <div className="home-kicker">TV Party Game</div>
            <img className="home-hero-logo" src={abcLogo} alt="ABC" />
            <h1 className="home-hero-title">
              Fast thinking.
              <span> Big screen fun.</span>
            </h1>
            <p className="home-hero-text">
              Race through categories, call out answers, and keep the room moving.
            </p>
            <div className="home-hero-actions">
              <button className="home-primary-btn" onClick={() => setScreen('setup')}>
                Set Up Game
              </button>
            </div>
          </div>

          <div className="home-hero-preview" aria-hidden="true">
            <div className="home-feature-card home-feature-card-big">
              <div className="home-round-badge">⚡</div>
              <h2 className="home-feature-title">Race the timer</h2>
              <p className="home-feature-copy">
                Players join on their phones and try to fill every category before someone shouts stop.
              </p>
              <div className="home-category-chips">
                <span>Boy</span>
                <span>Girl</span>
                <span>Animal</span>
                <span>Place</span>
                <span>Food</span>
                <span>Thing</span>
              </div>
            </div>
            <div className="home-mini-grid">
              <div className="home-feature-card home-floating-card">
                <div className="home-feature-title">60s</div>
                <p className="home-feature-copy">Timer rounds</p>
              </div>
              <div className="home-feature-card home-floating-card-two">
                <div className="home-feature-title">4+</div>
                <p className="home-feature-copy">Phone players</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="home-screen home-screen-setup">
      <section className="home-panel">
        <button className="home-back-btn" onClick={() => setScreen('welcome')} aria-label="Back to welcome">
          <span aria-hidden="true">←</span>
        </button>
        <div className="home-logo-wrap">
          <img className="home-logo" src={abcLogo} alt="ABC" />
        </div>
        <h1 className="home-tagline">Fast or Slow - TV Edition</h1>
        <p className="home-helper">Pick your game settings and get ready to play</p>

        <div className="home-settings">
          <div className="home-setting-row">
            <div className="home-setting-label">
              <div className="home-icon-bubble">🎯</div>
              <div>
                <div className="home-label-title">Rounds</div>
                <div className="home-label-copy">How many rounds<br />do you want to play?</div>
              </div>
            </div>
            <div className="home-setting-pills" role="group" aria-label="Rounds">
              {ROUND_OPTIONS.map((r) => (
                <button
                  key={r}
                  className={`pill ${rounds === r ? 'active' : ''}`}
                  onClick={() => setRounds(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="home-setting-row">
            <div className="home-setting-label">
              <div className="home-icon-bubble">⏱️</div>
              <div>
                <div className="home-label-title">Timer</div>
                <div className="home-label-copy">How much time<br />per round?</div>
              </div>
            </div>
            <div className="home-setting-pills" role="group" aria-label="Timer">
              {TIMER_OPTIONS.map((t) => (
                <button
                  key={t}
                  className={`pill ${timer === t ? 'active' : ''}`}
                  onClick={() => setTimer(t)}
                >
                  {t}s
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="home-error">{error}</p>}

        <button className="home-start" onClick={handleStart} disabled={loading}>
          <span className="home-gamepad">🎮</span>
          {loading ? 'CREATING...' : 'START NEW GAME'}
          <span className="home-spark">✦</span>
        </button>
      </section>
    </div>
  );
}
