// ============================================================
// Wall Duel — Game balance & tuning
// Every number that shapes the economy, progression and pacing
// lives here so it can be tuned without touching game code.
// ============================================================

/** Turn timer for every mode, in seconds. */
export const TURN_SECONDS = 60;

/** Extra seconds we wait for a remote player's move before declaring a timeout (network latency). */
export const ONLINE_TIMEOUT_GRACE_SECONDS = 5;

/** Online heartbeat: how often we ping, and after how long without a sign of life the opponent forfeits. */
export const HEARTBEAT_INTERVAL_MS = 3000;
export const HEARTBEAT_TIMEOUT_MS = 12000;

/** Quick match: seconds of searching before we offer a match against the computer. */
export const QUICK_MATCH_OFFER_AI_AFTER_SECONDS = 20;

/** Ads: a break ad is requested after every N finished matches. */
export const MATCHES_PER_BREAK_AD = 3;

/** Rewarded ad on the results screen multiplies the coins of that match by this. */
export const REWARDED_COIN_MULTIPLIER = 2;

// ------------------------------------------------------------
// Coins per match (unchanged from the original game)
// ------------------------------------------------------------
export const COINS = {
  localMatch: 50,
  onlineWin: 80,
  aiWin: { easy: 20, medium: 60, hard: 100, nightmare: 150 },
  /** Coins for each ladder star earned for the first time. */
  perNewLadderStar: 25,
  /** Coins when reaching a new level: base + perLevel * newLevel. */
  levelUpBase: 40,
  levelUpPerLevel: 10,
  /** Bonus coins when entering a new rank tier. */
  rankUp: 250,
  /** One-off reward for finishing the tutorial match. */
  tutorialComplete: 100,
};

// ------------------------------------------------------------
// XP per match
// ------------------------------------------------------------
export const XP = {
  aiWin: { easy: 30, medium: 50, hard: 80, nightmare: 120 },
  aiLoss: 10,
  onlineWin: 90,
  onlineLoss: 25,
  /** Local 2-player on one device gives no XP, so the new level system can't be farmed. */
  localMatch: 0,
  tutorial: 60,
  /** Bonus per star earned in a ladder match (first time or not). */
  perStar: 10,
};

/** XP needed to go from `level` to `level + 1`. */
export function xpToNextLevel(level: number): number {
  return 100 + (level - 1) * 40;
}

/** Ladder stars: win = 1 star; the rival still N+ squares from their goal = 2 / 3 stars. */
export const STAR_MARGINS = { twoStars: 3, threeStars: 6 };
