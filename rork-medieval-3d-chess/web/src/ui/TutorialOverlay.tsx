import { ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2 } from "lucide-react";

export function TutorialOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 pointer-events-auto">
      
      {/* Top Right Controls Pointer (Settings, Camera) */}
      <div className="absolute top-20 right-20 flex flex-col items-end gap-2 text-white/90">
        <div className="flex items-center gap-2">
          <p className="mc-display text-sm tracking-[0.2em] text-[#f4e3bd]">CAMERA & SETTINGS</p>
          <ArrowUpRight size={32} className="text-[#a89268] translate-x-2 -translate-y-2" />
        </div>
      </div>

      {/* Ledger Pointer: 
          On desktop (lg), it's a side rail on the right. 
          On mobile, it's a corner button on the bottom left. */}
      {/* Mobile Ledger Pointer */}
      <div className="absolute bottom-20 left-16 flex lg:hidden flex-col items-start gap-2 text-white/90">
        <div className="flex items-center gap-2">
          <ArrowDownLeft size={32} className="text-[#a89268] -translate-x-2 translate-y-2" />
          <p className="mc-display text-sm tracking-[0.2em] text-[#f4e3bd]">MOVE LEDGER</p>
        </div>
      </div>
      {/* Desktop Ledger Pointer */}
      <div className="hidden lg:flex absolute top-1/3 right-[16rem] flex-row items-center gap-2 text-white/90">
        <p className="mc-display text-sm tracking-[0.2em] text-[#f4e3bd]">MOVE LEDGER</p>
        <ArrowRight size={32} className="text-[#a89268] translate-x-2" />
      </div>

      {/* Center Dismiss Button */}
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="mc-slate mc-goldleaf p-6 max-w-sm">
          <h2 className="mc-display text-2xl text-[#f4e3bd]">COMMANDER'S GUIDE</h2>
          <p className="mt-3 text-sm text-[#b7a88a]">
            Familiarize yourself with the controls before making your first move.
          </p>
        </div>
        <button 
          onClick={onDismiss}
          className="mc-btn mc-btn-primary flex items-center gap-2 px-8 py-3"
        >
          <CheckCircle2 size={18} />
          <span>START BATTLE</span>
        </button>
      </div>

    </div>
  );
}
