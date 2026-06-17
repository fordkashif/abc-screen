import React from 'react';
import type { PlayerRecord, RoomRecord, AnswerCategory } from '@abc/shared';
import { ANSWER_KEYS, CATEGORY_LABELS } from '@abc/shared';
import abcLogo from '../assets/optimized/abc-logo.webp';
import { PlayerAvatar } from '../utils/playerAvatar';

type Props = {
  room: RoomRecord;
  players: Record<string, PlayerRecord>;
};

const CAT_COLORS = ['#ffe4d6', '#ffe1ee', '#fff1c5', '#dff8ff', '#ffe4c0', '#f0e3ff'];

function getAnswerReviewState(room: RoomRecord, playerId: string, category: AnswerCategory, rawAnswer: string) {
  const answer = rawAnswer.trim();
  if (!answer) return { label: 'Blank', valid: false };

  const override = room.answerOverrides?.[`${playerId}:${category}`];
  if (override === true) return { label: 'Accepted', valid: true };
  if (override === false) return { label: 'Rejected', valid: false };

  const startsRight = answer[0]?.toLowerCase() === room.currentLetter.toLowerCase();
  return startsRight ? { label: 'Accepted', valid: true } : { label: 'Wrong letter', valid: false };
}

export function ScreenResults({ room, players }: Props) {
  const sorted = Object.entries(players).sort(([, a], [, b]) => b.score - a.score);
  const visiblePlayers = sorted.slice(0, 4);
  const isLastRound = room.roundNumber >= room.settings.rounds;
  const dealerEntry = sorted.find(([id]) => id === room.currentDealerId);
  const dealerName = dealerEntry?.[1]?.name ?? 'Dealer';

  return (
    <div className="results-screen">
      <img className="rr-logo" src={abcLogo} alt="ABC" />
      <h1 className="rr-page-title">Round {room.roundNumber} Results</h1>

      <div className="rr-top-pills">
        <div className="rr-info-pill green">Letter: {room.currentLetter}</div>
        <div className="rr-info-pill">Round {room.roundNumber} of {room.settings.rounds}</div>
      </div>

      <aside className="rr-left-rail">
        <h2 className="rr-rail-title">Leaderboard</h2>
        {sorted.map(([id, p], index) => (
          <article key={id} className={`rr-leader-card ${index === 0 ? 'first' : ''}`}>
            <div className="rr-rank">{index + 1}</div>
            <PlayerAvatar player={p} className="rr-avatar" />
            <h3 className="rr-leader-name">{p.name}</h3>
            <div className="rr-gain">+{p.roundScore ?? 0}</div>
            <div className="rr-score">{p.score} pts</div>
          </article>
        ))}
      </aside>

      <section className="rr-results-panel">
        <div className="rr-panel-content">
          <div className="rr-panel-heading">
            <div className="rr-heading-icon">A</div>
            <h2 className="rr-heading-text">Answer Breakdown</h2>
          </div>

          <div className="rr-table-shell">
            <table className="rr-results-table">
              <thead>
                <tr>
                  <th>Category</th>
                  {visiblePlayers.map(([id, p]) => <th key={id}>{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {ANSWER_KEYS.map((cat, catIndex) => (
                  <tr key={cat}>
                    <td className="rr-cat-cell">
                      <span className="rr-cat-icon" style={{ '--chip': CAT_COLORS[catIndex % CAT_COLORS.length] } as React.CSSProperties}></span>
                      {CATEGORY_LABELS[cat]}
                    </td>
                    {visiblePlayers.map(([pid, p]) => {
                      const answer = p.answers?.[cat] ?? '';
                      const reviewState = getAnswerReviewState(room, pid, cat, answer);

                      if (!answer) {
                        return <td key={pid}><span className="rr-dash">-</span></td>;
                      }

                      return (
                        <td key={pid}>
                          <span className={`rr-answer-pill ${reviewState.valid ? '' : 'invalid'}`}>{answer}</span>
                          <span className={`rr-answer-meta ${reviewState.valid ? 'valid' : 'invalid'}`}>{reviewState.label}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rr-next-card">
        <div className="rr-next-copy">
          <div className="rr-next-icon">{isLastRound ? '!' : '>'}</div>
          <div>
            <h2 className="rr-next-title">{isLastRound ? 'Game ending' : 'Next round'}</h2>
            <p className="rr-next-subtitle">
              {isLastRound ? `${dealerName} will end the game` : `${dealerName} will start the next round`}
            </p>
            <p className="rr-review-note">Green answers were accepted. Red answers were rejected or used the wrong letter.</p>
          </div>
        </div>
        <div className="rr-next-button">{isLastRound ? 'Final scores' : 'Waiting on dealer'}</div>
      </section>
    </div>
  );
}
