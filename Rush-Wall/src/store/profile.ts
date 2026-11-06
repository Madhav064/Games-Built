// ============================================================
// Wall Duel — Player profile, economy & match rewards
// ============================================================

import { type PlayerProfile, type AIDifficulty, createDefaultProfile } from '../game/types';
import { saveData, loadData, loadLegacyData } from '../sdk/crazygames';
import { COINS, XP } from '../config/balance';
import { addXp, rankForLevel, type RankTier } from '../progression/xp';
import { starsForWin } from '../progression/ladder';
import { findCosmetic, CRAZYGAMES_AVATAR_ID, type AnyCosmetic } from './cosmetics';

const PROFILE_KEY = 'profile';
const MAX_NAME_LENGTH = 16;

let cached: PlayerProfile | null = null;

export function loadProfile(): PlayerProfile {
  if (cached) return cached;
  const raw = loadData(PROFILE_KEY) ?? loadLegacyData('player_profile');
  const defaults = createDefaultProfile();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
      cached = {
        ...defaults,
        ...parsed,
        settings: { ...defaults.settings, ...parsed.settings },
        ladderStars: { ...parsed.ladderStars },
      };
      // Older saves had no XP/level fields and no tutorial flag: treat them as returning players.
      if (parsed.tutorialDone === undefined && (parsed.gamesPlayed ?? 0) > 0) cached.tutorialDone = true;
      saveProfile(cached);
      return cached;
    } catch (e) {
      console.warn('[Profile] Could not read saved profile, starting fresh.', e);
    }
  }
  cached = defaults;
  saveProfile(cached);
  return cached;
}

export function saveProfile(profile: PlayerProfile): void {
  cached = profile;
  saveData(PROFILE_KEY, JSON.stringify(profile));
}

export function updateProfile(updates: Partial<PlayerProfile>): PlayerProfile {
  const next = { ...loadProfile(), ...updates, lastPlayedAt: Date.now() };
  saveProfile(next);
  return next;
}

export function setUsername(name: string): PlayerProfile {
  // CrazyGames players always use their account name.
  if (loadProfile().crazyGames) return loadProfile();
  const clean = name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, MAX_NAME_LENGTH);
  return clean ? updateProfile({ username: clean }) : loadProfile();
}

// ------------------------------------------------------------
// CrazyGames account
// ------------------------------------------------------------
/**
 * Use the CrazyGames username and picture. The first time an account is
 * linked, the picture is equipped; players can still pick a shop avatar later.
 */
export function linkCrazyGamesAccount(user: { username: string; profilePictureUrl: string }): PlayerProfile {
  const profile = loadProfile();
  const firstLink = !profile.crazyGames;
  return updateProfile({
    username: user.username,
    crazyGames: { username: user.username, avatarUrl: user.profilePictureUrl },
    equippedAvatar: firstLink && user.profilePictureUrl ? CRAZYGAMES_AVATAR_ID : profile.equippedAvatar,
  });
}

/** The avatar to show others: a shop avatar id, or the CrazyGames picture URL. */
export function resolveAvatar(profile: PlayerProfile): string {
  if (profile.equippedAvatar === CRAZYGAMES_AVATAR_ID) return profile.crazyGames?.avatarUrl || 'avatar_1';
  return profile.equippedAvatar;
}

// ------------------------------------------------------------
// Shop
// ------------------------------------------------------------
export function ownsCosmetic(profile: PlayerProfile, item: AnyCosmetic): boolean {
  return !!item.free || profile.unlockedCosmetics.includes(item.id);
}

export type PurchaseResult = { ok: true; profile: PlayerProfile } | { ok: false; reason: string };

export function purchaseCosmetic(itemId: string): PurchaseResult {
  const profile = loadProfile();
  const item = findCosmetic(itemId);
  if (!item) return { ok: false, reason: 'Item not found' };
  if (ownsCosmetic(profile, item)) return { ok: false, reason: 'Already owned' };
  if (profile.coins < item.price) return { ok: false, reason: `You need ${item.price - profile.coins} more coins` };
  return {
    ok: true,
    profile: updateProfile({
      coins: profile.coins - item.price,
      unlockedCosmetics: [...profile.unlockedCosmetics, itemId],
    }),
  };
}

export function equipCosmetic(itemId: string): PlayerProfile {
  const profile = loadProfile();
  if (itemId === CRAZYGAMES_AVATAR_ID) {
    return profile.crazyGames ? updateProfile({ equippedAvatar: itemId }) : profile;
  }
  const item = findCosmetic(itemId);
  if (!item || !ownsCosmetic(profile, item)) return profile;
  switch (item.type) {
    case 'pawn': return updateProfile({ equippedPawnSkin: itemId });
    case 'wall': return updateProfile({ equippedWallSkin: itemId });
    case 'board': return updateProfile({ equippedBoardTheme: itemId });
    case 'avatar': return updateProfile({ equippedAvatar: itemId });
    default: return profile;
  }
}

export function addCoins(amount: number): PlayerProfile {
  return updateProfile({ coins: loadProfile().coins + amount });
}

// ------------------------------------------------------------
// Match rewards
// ------------------------------------------------------------
export type MatchKind =
  | { kind: 'ai'; difficulty: AIDifficulty; rivalId?: string }
  | { kind: 'online' }
  | { kind: 'local' }
  | { kind: 'tutorial' };

export interface MatchSummary {
  match: MatchKind;
  /** True when the player on this device won (always true for local matches). */
  won: boolean;
  movesPlayed: number;
  wallsPlaced: number;
  /** Rival's remaining steps to their goal when the match ended (for ladder stars). */
  rivalStepsLeft: number;
}

export interface RewardLine { label: string; coins: number }

export interface MatchRewards {
  lines: RewardLine[];
  coins: number;
  /** Coins that the rewarded ad can multiply (match coins only, not bonuses). */
  matchCoins: number;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  xpAfter: number;
  newRank: RankTier | null;
  stars: number;
  newStars: number;
  profile: PlayerProfile;
}

export function recordMatch(summary: MatchSummary): MatchRewards {
  const profile = loadProfile();
  const { match, won } = summary;
  const lines: RewardLine[] = [];
  let xpGained = 0;
  let matchCoins = 0;
  let stars = 0;
  let newStars = 0;
  const ladderStars = { ...profile.ladderStars };

  switch (match.kind) {
    case 'ai':
      if (won) {
        matchCoins = COINS.aiWin[match.difficulty];
        xpGained = XP.aiWin[match.difficulty];
        if (match.rivalId) {
          stars = starsForWin(summary.rivalStepsLeft);
          const before = ladderStars[match.rivalId] ?? 0;
          newStars = Math.max(0, stars - before);
          ladderStars[match.rivalId] = Math.max(before, stars);
          xpGained += stars * XP.perStar;
        }
      } else {
        xpGained = XP.aiLoss;
      }
      break;
    case 'online':
      matchCoins = won ? COINS.onlineWin : 0;
      xpGained = won ? XP.onlineWin : XP.onlineLoss;
      break;
    case 'local':
      matchCoins = COINS.localMatch;
      xpGained = XP.localMatch;
      break;
    case 'tutorial':
      // Paid once: replaying the tutorial from the profile gives nothing.
      matchCoins = profile.tutorialDone ? 0 : COINS.tutorialComplete;
      xpGained = profile.tutorialDone ? 0 : XP.tutorial;
      break;
  }

  if (matchCoins > 0) lines.push({ label: match.kind === 'tutorial' ? 'Tutorial complete' : 'Match reward', coins: matchCoins });
  if (newStars > 0) lines.push({ label: `${newStars} new star${newStars > 1 ? 's' : ''}`, coins: newStars * COINS.perNewLadderStar });

  const xpResult = addXp(profile.level, profile.xp, xpGained);
  for (const lvl of xpResult.levelsReached) {
    lines.push({ label: `Reached level ${lvl}`, coins: COINS.levelUpBase + COINS.levelUpPerLevel * lvl });
  }
  if (xpResult.newRank) lines.push({ label: `${xpResult.newRank.name} rank`, coins: COINS.rankUp });

  const coins = lines.reduce((sum, l) => sum + l.coins, 0);
  // Local matches count as a win for player 1 on this device, as before.
  const countsAsWin = won;
  const updated = updateProfile({
    coins: profile.coins + coins,
    xp: xpResult.xp,
    level: xpResult.level,
    ladderStars,
    tutorialDone: profile.tutorialDone || match.kind === 'tutorial',
    gamesPlayed: profile.gamesPlayed + 1,
    gamesWon: profile.gamesWon + (countsAsWin ? 1 : 0),
    gamesLost: profile.gamesLost + (countsAsWin ? 0 : 1),
    winStreak: countsAsWin ? profile.winStreak + 1 : 0,
    bestWinStreak: countsAsWin ? Math.max(profile.bestWinStreak, profile.winStreak + 1) : profile.bestWinStreak,
    totalMovesPlayed: profile.totalMovesPlayed + summary.movesPlayed,
    totalWallsPlaced: profile.totalWallsPlaced + summary.wallsPlaced,
  });

  return {
    lines,
    coins,
    matchCoins,
    xpGained,
    levelBefore: profile.level,
    levelAfter: xpResult.level,
    xpAfter: xpResult.xp,
    newRank: xpResult.newRank,
    stars,
    newStars,
    profile: updated,
  };
}

export { rankForLevel };
