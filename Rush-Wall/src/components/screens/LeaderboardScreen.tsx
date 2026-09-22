import { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { getTopPlayers, getPlayerRank, ensureLeaderboardEntry, type LeaderboardEntry } from '../../sdk/leaderboard';
import { getCurrentUserId } from '../../sdk/supabase';
import { soundManager } from '../../audio/soundManager';
import { COSMETICS } from '../../store/cosmetics';

export function LeaderboardScreen() {
  const { state, dispatch } = useGame();
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [onlineWins, setOnlineWins] = useState<number>(0);
  const [myUserId, setMyUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // Sync local profile (avatar/name) to the global leaderboard
      await ensureLeaderboardEntry().catch(() => {});

      // Get current user ID for highlighting
      const uid = await getCurrentUserId();
      setMyUserId(uid || '');

      // Fetch top 50
      const data = await getTopPlayers();
      setPlayers(data);
      
      // Fetch my rank and online wins
      const { rank, onlineWins } = await getPlayerRank();
      if (rank > 0) {
        setMyRank(rank);
        setOnlineWins(onlineWins);
      }
      
      setLoading(false);
    }
    loadData();
  }, []);

  const goBack = () => {
    soundManager.play('click');
    dispatch({ type: 'SET_SCREEN', screen: 'home' });
  };

  return (
    <div className="screen flex-col" style={{ 
      padding: '0', 
      maxHeight: '100vh', 
      overflowY: 'auto',
      background: 'var(--color-bg-deep)'
    }}>
      {/* Header section */}
      <div style={{
        padding: '2rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <button 
          className="btn-icon" 
          onClick={goBack} 
          aria-label="Go Back"
          style={{ marginRight: '1rem', background: 'var(--color-bg-glass)', color: 'var(--color-blue)' }}
        >
          ←
        </button>
        <h2 style={{ 
          margin: 0, 
          fontSize: '1.8rem',
          color: 'var(--color-text-primary)',
          fontWeight: '900',
          textAlign: 'center'
        }}>
          Global Leaderboard
        </h2>
      </div>

      <div style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        {/* Personal Rank Card */}
        {!loading && myRank !== null && (
          <div className="surface-card" style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>
                  Your Rank
                </div>
                <div style={{ fontSize: '1rem', marginTop: '8px', color: 'var(--color-text-secondary)' }}>
                  {onlineWins} Online Wins • {state.profile.coins} Coins
                </div>
              </div>
              <div style={{ fontSize: '3.5rem', fontWeight: '900', lineHeight: 1, color: 'var(--color-text-primary)' }}>
                #{myRank}
              </div>
            </div>
            {/* Decorative background element */}
            <div style={{
              position: 'absolute',
              top: '-50%',
              right: '-10%',
              width: '200px',
              height: '200px',
              background: 'var(--color-bg-deep)',
              borderRadius: '50%',
              zIndex: 1
            }} />
          </div>
        )}

        {/* Top 50 List */}
        <div style={{
          background: 'var(--color-bg-glass)',
          borderRadius: '20px',
          padding: '1rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          border: '1px solid rgba(0,0,0,0.05)'
        }}>
          {loading ? (
            <div className="text-center" style={{ padding: '3rem', opacity: 0.5 }}>
              <div className="spinner" style={{ 
                width: '40px', height: '40px', margin: '0 auto 1rem',
                border: '4px solid var(--color-blue-glow)',
                borderTopColor: 'var(--color-blue)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              Loading rankings...
            </div>
          ) : players.length === 0 ? (
            <div className="text-center" style={{ padding: '3rem', opacity: 0.5 }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏆</div>
              No players on the leaderboard yet.<br/>Be the first!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(() => {
                let currentRank = 1;
                return players.map((player, index) => {
                  if (index > 0) {
                    const prev = players[index - 1];
                    if (player.wins !== prev.wins || player.coins !== prev.coins) {
                      currentRank = index + 1;
                    }
                  }
                  
                  const isTop3 = currentRank <= 3;
                  const isMe = player.user_id === myUserId;
                  const avatarImg = COSMETICS.find(c => c.id === player.avatar)?.preview || '/avatars/avatar_1.jpg';
                  return (
                    <div key={player.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '1rem',
                      borderRadius: '12px',
                      background: isMe 
                        ? 'rgba(74, 144, 226, 0.12)' // Blue tint
                        : isTop3 ? 'var(--color-bg-deep)' : 'transparent',
                      border: isMe 
                        ? '2px solid rgba(74, 144, 226, 0.5)' // Blue border
                        : isTop3 ? '1px solid var(--color-border-active)' : '1px solid rgba(0,0,0,0.05)',
                      transition: 'all 0.2s ease',
                      cursor: 'default'
                    }} className="leaderboard-row">
                      
                      <div style={{ 
                        width: '40px', 
                        fontWeight: '900', 
                        fontSize: isTop3 ? '1.2rem' : '1rem',
                        color: currentRank === 1 ? '#FFD700' : currentRank === 2 ? '#C0C0C0' : currentRank === 3 ? '#CD7F32' : 'var(--color-text-secondary)',
                        textAlign: 'center',
                        marginRight: '1rem'
                      }}>
                        #{currentRank}
                      </div>
                    
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundImage: `url(${avatarImg})`,
                        backgroundSize: 'cover',
                        border: isTop3 ? '2px solid var(--color-border-active)' : '2px solid rgba(0,0,0,0.1)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {player.username}
                        {isMe && (
                          <span style={{ 
                            fontSize: '0.7rem', 
                            background: 'var(--color-blue)', 
                            padding: '2px 8px', 
                            borderRadius: '10px',
                            fontWeight: '700',
                            color: '#fff'
                          }}>YOU</span>
                        )}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                          {player.coins} Coins
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ 
                      fontWeight: 'bold', 
                      fontSize: '1.2rem',
                      color: 'var(--color-text-primary)',
                      background: 'var(--color-bg-deep)',
                      padding: '4px 12px',
                      borderRadius: '20px'
                    }}>
                      {player.wins} W
                    </div>
                  </div>
                );
                });
              })()}
            </div>
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .leaderboard-row:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          background: rgba(0,0,0,0.02) !important;
        }
      `}</style>
    </div>
  );
}
