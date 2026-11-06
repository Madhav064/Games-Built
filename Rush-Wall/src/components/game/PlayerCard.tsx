// ============================================================
// Wall Duel — Player card (avatar, walls left, turn timer)
// ============================================================

import type { Player } from '../../game/types';
import { WALLS_PER_PLAYER } from '../../game/types';
import { avatarImage, pawnSpec, pawnPreviewCss } from '../../store/cosmetics';

interface Props {
  player: Player;
  active: boolean;
  timer: number | null;
  /** Latest emote from this player; it pops up and fades out by itself (CSS animation). */
  emote: { emoji: string; at: number } | null;
  isMe?: boolean;
  className?: string;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function PlayerCard({ player, active, timer, emote, isMe, className = '' }: Props) {
  const spec = pawnSpec(player.pawnSkin);
  const urgent = timer !== null && timer <= 10;
  return (
    <div className={`player-card ${active ? 'active' : ''} ${className}`} style={{ '--pawn': spec.color } as React.CSSProperties}>
      <div className="player-avatar">
        <img src={avatarImage(player.avatar)} alt="" />
        <span className="player-pawn-dot" style={{ background: pawnPreviewCss(spec) }} />
        {emote && <span className="player-emote" key={emote.at}>{emote.emoji}</span>}
      </div>
      <div className="player-meta">
        <div className="player-name">{player.name}{isMe && <span className="you-tag">you</span>}</div>
        <div className="wall-pips" aria-label={`${player.wallsRemaining} walls left`}>
          {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
            <span key={i} className={i < player.wallsRemaining ? 'pip' : 'pip used'} />
          ))}
        </div>
      </div>
      <div className={`player-timer ${urgent ? 'urgent' : ''}`}>
        {timer === null ? '' : formatTime(timer)}
      </div>
    </div>
  );
}
