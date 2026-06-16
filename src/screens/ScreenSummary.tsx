import React from 'react';
import type { PlayerRecord } from '@abc/shared';
import gameOverLogo from '../assets/gameover/mock-logo.png';
import topStandingsIcon from '../assets/gameover/top-standings.svg';
import topHomeIcon from '../assets/gameover/top-home.svg';
import podiumSecond from '../assets/gameover/podium-second.png';
import podiumFirst from '../assets/gameover/podium-first.png';
import podiumThird from '../assets/gameover/podium-third.png';
import medalSecond from '../assets/gameover/medal-second.png';
import medalThird from '../assets/gameover/medal-third.png';
import winnerBadge from '../assets/gameover/winner-badge.png';
import winnerRibbon from '../assets/gameover/winner-ribbon.png';
import emptyStar from '../assets/gameover/empty-star.png';
import iconNewPlayers from '../assets/gameover/icon-new-players.svg';
import iconResults from '../assets/gameover/icon-results.svg';
import iconHome from '../assets/gameover/icon-home.svg';
import { PlayerAvatar } from '../utils/playerAvatar';

type Props = {
  players: Record<string, PlayerRecord>;
  onPlayAgain: () => Promise<void>;
  onBackHome: () => void;
};

function Avatar({ player, className = '' }: { player: PlayerRecord; className?: string }) {
  return <PlayerAvatar player={player} className={`go-avatar ${className}`} />;
}

function PodiumSlot({ player, rank }: { player?: PlayerRecord; rank: 1 | 2 | 3 }) {
  const isWinner = rank === 1;
  const wrapClass = rank === 1 ? 'first' : rank === 2 ? 'second' : 'third';
  const podiumAsset = rank === 1 ? podiumFirst : rank === 2 ? podiumSecond : podiumThird;
  const medalAsset = rank === 2 ? medalSecond : medalThird;

  return (
    <article className={`go-podium-wrap ${wrapClass}`}>
      <img className="go-podium-base" src={podiumAsset} alt="" />
      <div className={`go-podium-card ${isWinner ? 'winner-card' : ''}`}>
        {isWinner && player ? <img className="go-winner-badge" src={winnerBadge} alt="" /> : <img className="go-medal" src={medalAsset} alt="" />}
        {player ? (
          <>
            {isWinner && <div className="go-sparkles" aria-hidden="true"><span></span><span></span><span></span></div>}
            <Avatar player={player} className={isWinner ? 'winner-avatar' : ''} />
            {isWinner && <img className="go-ribbon" src={winnerRibbon} alt="Winner!" />}
            <h2 className="go-player-name">{player.name}</h2>
            <p className="go-score">{player.score} pts</p>
          </>
        ) : (
          <>
            <img className="go-empty-slot" src={emptyStar} alt="" />
            <p className="go-empty-title">No one<br />else played</p>
          </>
        )}
      </div>
    </article>
  );
}

export function ScreenSummary({ players, onPlayAgain, onBackHome }: Props) {
  const sorted = Object.values(players).sort((a, b) => b.score - a.score);
  const [busy, setBusy] = React.useState(false);
  const standingsRef = React.useRef<HTMLDivElement>(null);

  async function handlePlayAgain() {
    if (busy) return;
    setBusy(true);
    try {
      await onPlayAgain();
    } finally {
      setBusy(false);
    }
  }

  function handleViewResults() {
    standingsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    standingsRef.current?.classList.remove('go-summary-card-pulse');
    window.setTimeout(() => standingsRef.current?.classList.add('go-summary-card-pulse'), 0);
  }

  return (
    <main className="summary-screen">
      <img className="go-logo" src={gameOverLogo} alt="ABC Fast or Slow" />

      <div className="go-top-actions">
        <button className="go-top-pill" type="button" onClick={handleViewResults}><img src={topStandingsIcon} alt="" />Final Standings &gt;</button>
        <button className="go-home-btn" type="button" aria-label="Home" onClick={onBackHome}><img src={topHomeIcon} alt="" /></button>
      </div>

      <span className="go-float go-bubble-1"></span>
      <span className="go-float go-bubble-2"></span>
      <span className="go-float go-bubble-3"></span>
      <span className="go-float go-star-1">*</span>
      <span className="go-float go-star-2">*</span>
      <span className="go-float go-square-1"></span>
      <span className="go-float go-square-2"></span>
      <span className="go-float go-square-3"></span>
      <span className="go-float go-square-4"></span>
      <span className="go-float go-squiggle-1"></span>
      <span className="go-float go-squiggle-2"></span>

      <section className="go-hero">
        <div className="go-party">!</div>
        <h1 className="go-title">Game Over!</h1>
        <p className="go-subtitle">Great game! Ready for another round?</p>
      </section>

      <section className="go-main-stage">
        <PodiumSlot player={sorted[1]} rank={2} />
        <PodiumSlot player={sorted[0]} rank={1} />
        <PodiumSlot player={sorted[2]} rank={3} />
      </section>

      <section className="go-actions">
        <button className="go-play-again" type="button" onClick={handlePlayAgain} disabled={busy}>
          <span className="go-replay">↻</span> {busy ? 'Resetting...' : 'Play Again!'}
        </button>

        <div className="go-summary-card" ref={standingsRef}>
          <h2 className="go-summary-title">Final Standings</h2>
          <div className="go-standings">
            {sorted.map((player, index) => (
              <div key={`${player.name}-${index}`} className="go-standing-row">
                <div className={`go-standing-medal ${index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}`}>{index + 1}</div>
                <Avatar player={player} className="standing" />
                <div className="go-standing-name">{player.name}</div>
                <div className="go-standing-points">{player.score} pts</div>
              </div>
            ))}
          </div>
        </div>

        <div className="go-secondary-actions">
          <button className="go-secondary" type="button" onClick={handlePlayAgain} disabled={busy}><img src={iconNewPlayers} alt="" />New Players</button>
          <button className="go-secondary" type="button" onClick={handleViewResults}><img src={iconResults} alt="" />View Full Results</button>
          <button className="go-secondary" type="button" onClick={onBackHome}><img src={iconHome} alt="" />Back to Home</button>
        </div>
        <p className="go-thanks">Thanks for playing!</p>
      </section>
    </main>
  );
}
