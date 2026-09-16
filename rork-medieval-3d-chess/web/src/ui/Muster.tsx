import { Lock } from "lucide-react";

import { ARENA_CARDS, ARMY_CARDS, ARMY_SKINS, ARMY_SKIN_ORDER, type ArmySkinId } from "../assets/generated";
import type { Faction } from "../core/types";
import { ARENA_LOOKS, ARENA_ORDER, type ArenaTheme } from "../scene/arena";
import { isArenaUnlocked, getArenaUnlockRequirement, isArmyUnlocked, getArmyUnlockRequirement } from "../core/progress";

/**
 * The war-table choices: which army each side musters and which ground they
 * fight on. Both are settled *before* the first move — swapping an army mid-duel
 * would tear down and re-download every figure on the board, and swapping the
 * ground would re-stage the hall underneath pieces that are already fighting.
 * So these pickers live in the menu, and the in-match panel shows them locked.
 */
export interface MusterChoice {
  skins: Record<Faction, ArmySkinId>;
  arena: ArenaTheme;
}

/** Blurb under the army rows — honest about what a mirror match looks like. */
export function armyBlurb(skins: Record<Faction, ArmySkinId>): string {
  return skins.w === skins.b
    ? `Both sides muster the ${ARMY_SKINS[skins.w].label} — the near side is marked in azure, the far side in ember, on the ground and along every silhouette.`
    : ARMY_SKINS[skins.w].blurb;
}

/**
 * One side's army choice: a row of cards, one per skin.
 *
 * Same rule as the battleground picker — the painted banner is decoration laid
 * over the livery gradient, never instead of it, so a card whose art is still
 * downloading still reads as that army's colours.
 */
export function ArmyPicker({
  side,
  name,
  chosen,
  onChoose,
}: {
  side: Faction;
  name: string;
  chosen: ArmySkinId;
  onChoose: (skin: ArmySkinId) => void;
}) {
  return (
    <div className="mb-2">
      <p className="mb-1.5 flex items-center gap-2 text-[0.66rem] italic text-[#9c8b6c]">
        <SideDot side={side} />
        {name}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {ARMY_SKIN_ORDER.map((skin) => {
          const unlocked = isArmyUnlocked(skin);
          const req = getArmyUnlockRequirement(skin);
          return (
          <button
            key={skin}
            type="button"
            className={`mc-army-card ${!unlocked ? "opacity-50 cursor-not-allowed" : ""}`}
            data-active={chosen === skin}
            onClick={() => unlocked && onChoose(skin)}
            title={unlocked ? ARMY_SKINS[skin].blurb : req!}
          >
            <span className="mc-army-swatch" data-army={skin}>
              <img className="mc-army-art" src={ARMY_CARDS[skin]} alt="" loading="lazy" decoding="async" />
            </span>
            <span className="mc-display flex items-center justify-center gap-1 text-[0.64rem] leading-tight text-[#f0e0be]">
              {!unlocked && <Lock size={10} />}
              {ARMY_SKINS[skin].label}
            </span>
            {unlocked ? (
              <span className="text-[0.58rem] leading-tight text-[#9c8b6c]">{ARMY_SKINS[skin].ranks.p}</span>
            ) : (
              <span className="mt-1 text-[0.55rem] text-[#ff8f7d] leading-tight px-1">{req}</span>
            )}
          </button>
        )})}
      </div>
    </div>
  );
}

/**
 * The ground the board is staged on: a painted card per map.
 *
 * The card art is decoration on top of the palette gradient, never instead of
 * it — the gradient stays as the swatch's background, so a card that is still
 * downloading (or never arrives) leaves a picker that still reads correctly
 * instead of a row of empty holes.
 */
export function ArenaPicker({ chosen, onChoose }: { chosen: ArenaTheme; onChoose: (theme: ArenaTheme) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ARENA_ORDER.map((theme) => {
          const unlocked = isArenaUnlocked(theme);
          const req = getArenaUnlockRequirement(theme);
          return (
          <button
            key={theme}
            type="button"
            className={`mc-arena-card ${!unlocked ? "opacity-50 cursor-not-allowed" : ""}`}
            data-active={chosen === theme}
            onClick={() => unlocked && onChoose(theme)}
            title={unlocked ? ARENA_LOOKS[theme].note : req!}
          >
            <span className="mc-arena-swatch" data-arena={theme}>
              <img className="mc-arena-art" src={ARENA_CARDS[theme]} alt="" loading="lazy" decoding="async" />
            </span>
            <span className="mc-display flex flex-col items-center gap-1 text-[0.68rem] leading-tight text-[#f0e0be]">
              <div className="flex items-center gap-1">
                {!unlocked && <Lock size={10} />}
                {ARENA_LOOKS[theme].label}
              </div>
              {!unlocked && (
                <span className="text-[0.55rem] text-[#ff8f7d] leading-tight px-1 mt-0.5">{req}</span>
              )}
            </span>
          </button>
        )})}
      </div>
      <p className="mt-2 text-xs italic text-[#9c8b6c]">{ARENA_LOOKS[chosen].note}</p>
    </>
  );
}

/**
 * The full war table — armies for both sides plus the battleground. Used on the
 * main menu before a duel and inside settings while no duel is running.
 */
export function MusterSection({
  choice,
  onChange,
}: {
  choice: MusterChoice;
  onChange: (choice: MusterChoice) => void;
}) {
  return (
    <>
      <p className="mc-display mb-2 text-[0.6rem] tracking-[0.3em] text-[#a89268]">Pieces</p>
      <ArmyPicker
        side="w"
        name="White"
        chosen={choice.skins.w}
        onChoose={(skin) => onChange({ ...choice, skins: { ...choice.skins, w: skin } })}
      />
      <ArmyPicker
        side="b"
        name="Black"
        chosen={choice.skins.b}
        onChoose={(skin) => onChange({ ...choice, skins: { ...choice.skins, b: skin } })}
      />
      <p className="mt-2 text-xs italic text-[#9c8b6c]">{armyBlurb(choice.skins)}</p>

      <div className="mc-rule my-5" />

      <p className="mc-display mb-2 text-[0.6rem] tracking-[0.3em] text-[#a89268]">Battleground</p>
      <ArenaPicker chosen={choice.arena} onChoose={(arena) => onChange({ ...choice, arena })} />
    </>
  );
}

/**
 * The same three choices, read-only, for a duel already under way: it states
 * what is on the board and why it cannot change now.
 */
export function MusterLocked({ choice }: { choice: MusterChoice }) {
  return (
    <div className="mc-muster-locked">
      <p className="mc-display mb-2 flex items-center gap-2 text-[0.6rem] tracking-[0.3em] text-[#a89268]">
        <Lock size={11} />
        Muster · locked
      </p>
      <dl className="space-y-1.5">
        <LockedRow label={<SideDot side="w" />} name="Near side" value={ARMY_SKINS[choice.skins.w].label} />
        <LockedRow label={<SideDot side="b" />} name="Far side" value={ARMY_SKINS[choice.skins.b].label} />
        <LockedRow
          label={<span className="mc-arena-dot" data-arena={choice.arena} />}
          name="Battleground"
          value={ARENA_LOOKS[choice.arena].label}
        />
      </dl>
      <p className="mt-2.5 text-xs italic text-[#9c8b6c]">
        Armies and ground are chosen before the first move. Leave this duel with{" "}
        <span className="mc-display not-italic text-[#e2c98f]">New duel</span> to muster differently.
      </p>
    </div>
  );
}

function LockedRow({ label, name, value }: { label: React.ReactNode; name: string; value: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[#8a652222] pb-1.5 last:border-b-0 last:pb-0">
      {label}
      <dt className="text-[0.66rem] italic text-[#9c8b6c]">{name}</dt>
      <dd className="mc-display ml-auto text-[0.72rem] text-[#d9c69c]">{value}</dd>
    </div>
  );
}

/** The side's colour code, matching the band painted under its figures. */
function SideDot({ side }: { side: Faction }) {
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full border"
      style={{
        background: side === "w" ? "#5fb0ff" : "#ff5230",
        borderColor: side === "w" ? "#bfe0ffcc" : "#ffb083cc",
      }}
    />
  );
}
