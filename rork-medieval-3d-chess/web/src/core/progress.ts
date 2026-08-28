import type { ArenaTheme } from "../scene/arena";
import type { ArmySkinId } from "../assets/generated";
import { getStorage } from "./storage";

const WINS_KEY = "kg.wins";
const AI_WINS_KEY = "kg.aiWins";

function getWins(): number {
  return parseInt(getStorage().getItem(WINS_KEY) || "0", 10);
}

function getAiWins(): number {
  return parseInt(getStorage().getItem(AI_WINS_KEY) || "0", 10);
}

export function recordWin(isAi: boolean) {
  const wins = getWins() + 1;
  getStorage().setItem(WINS_KEY, wins.toString());
  if (isAi) {
    const aiWins = getAiWins() + 1;
    getStorage().setItem(AI_WINS_KEY, aiWins.toString());
  }
}

export function isArenaUnlocked(arena: ArenaTheme): boolean {
  const wins = getWins();
  if (arena === "jungle") return true; // Default
  if (arena === "dawn") return wins >= 1;
  if (arena === "sands" || arena === "frost") return wins >= 2;
  if (arena === "storm" || arena === "dusk") return wins >= 3;
  return true;
}

export function getArenaUnlockRequirement(arena: ArenaTheme): string | null {
  if (isArenaUnlocked(arena)) return null;
  if (arena === "dawn") return "Unlocks after 1 win";
  if (arena === "sands" || arena === "frost") return "Unlocks after 2 wins";
  if (arena === "storm" || arena === "dusk") return "Unlocks after 3 wins";
  return "Locked";
}

export function isArmyUnlocked(army: ArmySkinId): boolean {
  if (army === "empire") {
    return getAiWins() >= 1;
  }
  return true;
}

export function getArmyUnlockRequirement(army: ArmySkinId): string | null {
  if (isArmyUnlocked(army)) return null;
  if (army === "empire") {
    return "Defeat the computer on any difficulty";
  }
  return "Locked";
}

// Attach a cheat command to the window object for testing
if (typeof window !== "undefined") {
  (window as any).cheatUnlockAll = () => {
    getStorage().setItem(WINS_KEY, "100");
    getStorage().setItem(AI_WINS_KEY, "100");
    console.log("All arenas and armies unlocked! Reload the page to see changes.");
  };
  (window as any).cheatResetProgress = () => {
    getStorage().removeItem(WINS_KEY);
    getStorage().removeItem(AI_WINS_KEY);
    console.log("Progress reset! Reload the page to see changes.");
  };
}
