import { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { joinQueue, cancelQueue, type MatchStatus } from '../../sdk/multiplayer';
import { soundManager } from '../../audio/soundManager';

export function MatchmakingScreen() {
  const { state, dispatch, startOnlineGame } = useGame();
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [dots, setDots] = useState('');

  useEffect(() => {
    // Animate dots
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    // Start matchmaking
    joinQueue(
      state.profile,
      (matchInfo) => {
        if (isCancelled) return;
        soundManager.play('win'); // simple ping sound for match found
        
        // Quick flash of "Match Found!" then switch to game
        setTimeout(() => {
          if (!isCancelled) {
            startOnlineGame(matchInfo);
          }
        }, 500);
      },
      (newStatus) => {
        if (!isCancelled) {
          setStatus(newStatus);
        }
      }
    );

    return () => {
      isCancelled = true;
      cancelQueue();
    };
  }, [startOnlineGame, state.profile]);

  const handleCancel = () => {
    soundManager.play('click');
    dispatch({ type: 'SET_SCREEN', screen: 'home' });
  };

  return (
    <div className="screen flex-col flex-center" style={{ 
      background: 'var(--color-bg-deep)',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div className="matchmaking-container" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '3rem',
        borderRadius: '24px',
        background: 'var(--color-bg-glass)',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--color-border-active)'
      }}>
        <h2 style={{ 
          fontSize: '2rem', 
          marginBottom: '2rem',
          background: 'linear-gradient(45deg, var(--color-blue), var(--color-cyan))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: '900',
          textAlign: 'center'
        }}>
          {status === 'searching' ? `Searching for Opponent${dots}` : status === 'matched' ? 'Opponent Found!' : 'Matchmaking'}
        </h2>

        <div className="radar-animation" style={{
          position: 'relative',
          width: '120px',
          height: '120px',
          marginBottom: '3rem'
        }}>
          {/* Base Dot */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '24px', height: '24px',
            backgroundColor: 'var(--color-blue)',
            borderRadius: '50%',
            zIndex: 2,
            boxShadow: '0 0 15px var(--color-blue)'
          }} />

          {/* Pulsing Rings */}
          {status === 'searching' && (
            <>
              <div className="pulse-ring pulse-ring-1" style={pulseRingStyle(0)} />
              <div className="pulse-ring pulse-ring-2" style={pulseRingStyle(0.5)} />
              <div className="pulse-ring pulse-ring-3" style={pulseRingStyle(1)} />
            </>
          )}

          {/* Success Checkmark Placeholder */}
          {status === 'matched' && (
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '3rem',
              color: 'var(--color-blue)',
              zIndex: 3
            }}>
              ⚔️
            </div>
          )}
        </div>

        {status === 'error' && (
          <p style={{ color: 'var(--color-danger)', marginBottom: '1.5rem', fontWeight: 'bold' }}>
            Could not connect to multiplayer servers.
          </p>
        )}

        <button 
          className="btn btn-secondary" 
          onClick={handleCancel}
          style={{ width: '100%', padding: '12px', borderRadius: '12px', marginTop: '1rem' }}
        >
          Cancel
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

const pulseRingStyle = (delay: number): React.CSSProperties => ({
  position: 'absolute',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '40px', height: '40px',
  border: '3px solid var(--color-blue)',
  borderRadius: '50%',
  animation: `pulse 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite`,
  animationDelay: `${delay}s`,
  opacity: 0,
});
