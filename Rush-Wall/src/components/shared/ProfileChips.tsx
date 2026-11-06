import { useGame } from '../../context/GameContext';
import { rankForLevel, levelProgress } from '../../progression/xp';

/** Coins + level/rank summary shown at the top of menu screens. */
export function ProfileChips() {
  const { state } = useGame();
  const { profile } = state;
  const rank = rankForLevel(profile.level);
  return (
    <div className="chips">
      <span className="chip chip-coins">🪙 {profile.coins}</span>
      <span className="chip chip-level" title={`${rank.name} rank`}>
        <span style={{ color: rank.color }}>{rank.icon}</span> Lv {profile.level}
        <span className="mini-xp"><span style={{ width: `${Math.round(levelProgress(profile.level, profile.xp) * 100)}%` }} /></span>
      </span>
    </div>
  );
}
