// ============================================================
// Wall Duel — Shop: pawns, walls, boards, avatars, emotes
// ============================================================

import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import type { CosmeticType } from '../../game/types';
import {
  PAWNS, WALLS, BOARDS, AVATARS, EMOTES, RARITY_COLORS, CRAZYGAMES_AVATAR_ID,
  pawnSpec, pawnPreviewCss, wallPreviewCss,
  type AnyCosmetic, type AvatarItem, type BoardItem,
} from '../../store/cosmetics';
import { ownsCosmetic, purchaseCosmetic, equipCosmetic } from '../../store/profile';
import { soundManager } from '../../audio/soundManager';
import { ProfileChips } from '../shared/ProfileChips';

const TABS: { id: CosmeticType; label: string; items: AnyCosmetic[] }[] = [
  { id: 'pawn', label: 'Pawns', items: PAWNS },
  { id: 'wall', label: 'Walls', items: WALLS },
  { id: 'board', label: 'Boards', items: BOARDS },
  { id: 'avatar', label: 'Avatars', items: AVATARS },
  { id: 'emote', label: 'Emotes', items: EMOTES },
];

const CLASSIC_PREVIEW = { light: ['#efe4c8', '#fffaf0', '#f8efdb'], dark: ['#1a1d4a', '#2a2e6e', '#252964'] };

export function ShopScreen() {
  const { state, setProfile } = useGame();
  const { profile } = state;
  const [tab, setTab] = useState<CosmeticType>('pawn');
  const [toast, setToast] = useState<string | null>(null);
  const myPawn = pawnSpec(profile.equippedPawnSkin);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const equippedId: Partial<Record<CosmeticType, string>> = {
    pawn: profile.equippedPawnSkin,
    wall: profile.equippedWallSkin,
    board: profile.equippedBoardTheme,
    avatar: profile.equippedAvatar,
  };

  const onItem = (item: AnyCosmetic) => {
    if (ownsCosmetic(profile, item)) {
      if (item.type === 'emote' || equippedId[item.type] === item.id) return;
      soundManager.play('click');
      setProfile(equipCosmetic(item.id));
      flash(`Equipped ${item.name}`);
      return;
    }
    const result = purchaseCosmetic(item.id);
    if (result.ok) {
      soundManager.play('purchase');
      // Buying equips it straight away (emotes are always available once owned).
      setProfile(item.type === 'emote' ? result.profile : equipCosmetic(item.id));
      flash(`Unlocked ${item.name}!`);
    } else {
      soundManager.play('invalidMove');
      flash(result.reason);
    }
  };

  // Logged-in CrazyGames players can also use their CrazyGames picture (free).
  const crazyAvatar: AvatarItem | null = profile.crazyGames?.avatarUrl
    ? { id: CRAZYGAMES_AVATAR_ID, name: 'My CrazyGames picture', type: 'avatar', price: 0, rarity: 'common', image: profile.crazyGames.avatarUrl, free: true }
    : null;
  const tabItems = TABS.find(t => t.id === tab)!.items;
  const items = tab === 'avatar' && crazyAvatar ? [crazyAvatar, ...tabItems] : tabItems;

  return (
    <div className="screen menu-screen">
      <header className="menu-header">
        <h1 className="screen-title">Shop</h1>
        <ProfileChips />
      </header>

      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab on' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="shop-grid">
        {items.map(item => {
          const owned = ownsCosmetic(profile, item);
          const equipped = equippedId[item.type] === item.id;
          const affordable = profile.coins >= item.price;
          return (
            <button
              key={item.id}
              className={`shop-item ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}`}
              style={{ '--rarity': RARITY_COLORS[item.rarity] } as React.CSSProperties}
              onClick={() => onItem(item)}
            >
              <span className="rarity">{item.rarity}</span>
              <span className="shop-preview">{preview(item, myPawn.color, profile.settings.theme)}</span>
              <span className="shop-name">{item.name}</span>
              <span className={`shop-status ${!owned && !affordable ? 'too-expensive' : ''}`}>
                {equipped ? '✓ Equipped' : owned ? (item.type === 'emote' ? 'Owned' : 'Equip') : `🪙 ${item.price}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function preview(item: AnyCosmetic, myPawnColor: string, theme: 'light' | 'dark') {
  switch (item.type) {
    case 'pawn':
      return (
        <span className="preview-pawn" style={{ background: pawnPreviewCss(item.spec) }}>
          {item.spec.icon && <span>{item.spec.icon}</span>}
        </span>
      );
    case 'wall':
      return (
        <span className="preview-wall-wrap">
          <span className="preview-wall" style={{ background: wallPreviewCss(item.spec, myPawnColor), boxShadow: item.spec.glow ? `0 0 10px ${item.spec.glow}` : undefined }} />
        </span>
      );
    case 'board':
      return <BoardPreview item={item} theme={theme} />;
    case 'avatar':
      return <img className="preview-avatar" src={item.image} alt="" loading="lazy" />;
    case 'emote':
      return <span className="preview-emote">{item.emoji}</span>;
  }
}

function BoardPreview({ item, theme }: { item: BoardItem; theme: 'light' | 'dark' }) {
  const s = item.spec;
  const [surface, a, b] = s.followsAppTheme ? CLASSIC_PREVIEW[theme] : [s.surface, s.cellA, s.cellB];
  return (
    <span className="preview-board" style={{ background: s.followsAppTheme ? surface : s.frame }}>
      {Array.from({ length: 16 }, (_, i) => (
        <span key={i} style={{ background: (Math.floor(i / 4) + i) % 2 === 0 ? a : b }} />
      ))}
    </span>
  );
}
