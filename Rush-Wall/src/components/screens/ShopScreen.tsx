// ============================================================
// Rush Wall — Shop Screen
// ============================================================

import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { type CosmeticItem } from '../../game/types';
import {
  getCosmeticsWithStatus,
  purchaseCosmetic,
  equipCosmetic,
} from '../../store/cosmetics';
import { soundManager } from '../../audio/soundManager';

type TabType = 'pawn' | 'wall' | 'board' | 'emote' | 'avatar';

export function ShopScreen() {
  const { state, dispatch, refreshProfile } = useGame();
  const { profile } = state;
  const [activeTab, setActiveTab] = useState<TabType>('pawn');
  const [message, setMessage] = useState('');

  const cosmetics = getCosmeticsWithStatus();
  const filtered = cosmetics.filter(c => c.type === activeTab);

  const isEquipped = (item: CosmeticItem) => {
    switch (item.type) {
      case 'pawn': return profile.equippedPawnSkin === item.id;
      case 'wall': return profile.equippedWallSkin === item.id;
      case 'board': return profile.equippedBoardTheme === item.id;
      case 'avatar': return profile.equippedAvatar === item.id;
      default: return false;
    }
  };

  const handleItemClick = (item: CosmeticItem) => {
    soundManager.play('click');

    if (item.unlocked || profile.unlockedCosmetics.includes(item.id)) {
      // Equip
      if (item.type !== 'emote') {
        equipCosmetic(item.id);
        refreshProfile();
        setMessage(`Equipped ${item.name}!`);
        soundManager.play('click');
      }
    } else {
      // Purchase
      const result = purchaseCosmetic(item.id);
      if (result.success) {
        soundManager.play('purchase');
        refreshProfile();
        setMessage(result.message);
      } else {
        soundManager.play('invalidMove');
        setMessage(result.message);
      }
    }

    setTimeout(() => setMessage(''), 2000);
  };

  const goBack = () => {
    soundManager.play('click');
    dispatch({ type: 'SET_SCREEN', screen: 'home' });
  };

  return (
    <div className="screen shop-screen">
      <div className="shop-header">
        <button className="btn btn-ghost" onClick={goBack}>← Back</button>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem' }}>🛍️ Shop</h2>
        <div className="shop-balance">
          🪙 {profile.coins}
        </div>
      </div>

      {message && (
        <div style={{
          padding: '8px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(0, 212, 255, 0.1)',
          border: '1px solid rgba(0, 212, 255, 0.3)',
          marginBottom: '12px',
          fontSize: '0.85rem',
          textAlign: 'center',
          animation: 'fadeIn 0.3s ease-out',
          maxWidth: '500px',
          width: '100%',
        }}>
          {message}
        </div>
      )}

      <div className="shop-tabs">
        {(['pawn', 'emote', 'avatar'] as TabType[]).map(tab => (
          <button
            key={tab}
            className={`shop-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); soundManager.play('click'); }}
          >
            {tab === 'pawn' && '🔮 Pawns'}
            {tab === 'emote' && '😊 Emotes'}
            {tab === 'avatar' && '👤 Avatars'}
          </button>
        ))}
      </div>

      <div className="shop-grid">
        {filtered.map(item => {
          const owned = item.unlocked || profile.unlockedCosmetics.includes(item.id);
          const equipped = isEquipped(item);

          return (
            <div
              key={item.id}
              className={`shop-item ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}`}
              onClick={() => handleItemClick(item)}
            >
              <div
                className={`shop-item-preview ${item.type === 'pawn' ? 'pawn-sphere' : ''}`}
                style={{
                  background: item.type === 'avatar' ? 'transparent' : (item.type === 'emote' ? 'rgba(0,0,0,0.2)' : item.preview),
                  fontSize: item.type === 'emote' ? '2rem' : '1.5rem',
                  overflow: item.type === 'pawn' ? 'visible' : 'hidden',
                  borderRadius: item.type === 'avatar' ? '50%' : undefined,
                  position: 'relative'
                }}
              >
                {item.type === 'emote' && item.preview}
                {item.type === 'avatar' && (
                  <img src={item.preview} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                {item.type === 'pawn' && item.icon && (
                  <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2 }}>
                    {item.icon}
                  </span>
                )}
              </div>
              <div className="shop-item-name">{item.name}</div>
              {equipped ? (
                <div className="shop-item-status">✓ Equipped</div>
              ) : owned ? (
                <div className="shop-item-status" style={{ color: 'var(--color-text-secondary)' }}>
                  {item.type === 'emote' ? 'Unlocked' : 'Tap to equip'}
                </div>
              ) : (
                <div className="shop-item-price">🪙 {item.price}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
