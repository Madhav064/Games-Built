import { X, MousePointerClick, Mouse, Keyboard } from "lucide-react";

interface GameManualModalProps {
  onClose: () => void;
}

export function GameManualModal({ onClose }: GameManualModalProps) {
  return (
    <div className="mc-modal-pad pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-black/60 backdrop-blur-sm">
      <div className="mc-slate mc-goldleaf mc-rise flex max-h-full w-full min-h-0 max-w-2xl flex-col p-5 sm:p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="mc-display text-2xl text-[#f2e2bd]">COMMANDER'S MANUAL</h2>
          <button type="button" className="mc-btn mc-icon-btn" onClick={onClose} aria-label="Close manual">
            <X size={20} />
          </button>
        </div>

        <div className="mc-scroll mc-scroll-shade min-h-0 flex-auto overflow-y-auto pr-3">
          
          <section className="mb-8">
            <h3 className="mc-display mb-3 text-lg text-[#d8b163] flex items-center gap-2">
              <MousePointerClick size={18} /> Interactions & Controls
            </h3>
            <div className="space-y-3 text-sm text-[#b7a88a] leading-relaxed">
              <p>
                <strong className="text-[#e2c98f]">Moving Pieces:</strong> Left-click on a piece to select it, then left-click on a highlighted square to move it.
              </p>
              <p>
                <strong className="text-[#e2c98f]">Camera Control:</strong> Right-click and drag (or left-click and drag in empty space) to rotate the camera around the board. Scroll to zoom in and out.
              </p>
              <div className="mt-4 rounded-sm border border-[#8a652255] bg-[#00000020] p-3">
                <h4 className="mc-display mb-2 text-xs tracking-widest text-[#a89268]">KEYBOARD SHORTCUTS</h4>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <li><strong className="text-[#d8b163] mr-2">F</strong> Flip Camera 180°</li>
                  <li><strong className="text-[#d8b163] mr-2">T</strong> Toggle Tactical 2D Map</li>
                  <li><strong className="text-[#d8b163] mr-2">C</strong> Toggle Cinema Mode (Hide HUD)</li>
                  <li><strong className="text-[#d8b163] mr-2">H</strong> Toggle Move Ledger</li>
                  <li><strong className="text-[#d8b163] mr-2">ESC</strong> Clear queued moves / Close panels</li>
                  <li><strong className="text-[#d8b163] mr-2">Q,R,B,N</strong> Promote to Queen, Rook, Bishop, Knight</li>
                </ul>
              </div>
            </div>
          </section>

          <div className="mc-rule mb-8 opacity-50" />

          <section>
            <h3 className="mc-display mb-3 text-lg text-[#d8b163]">Rules of Battle</h3>
            <div className="space-y-4 text-sm text-[#b7a88a] leading-relaxed">
              <div>
                <strong className="text-[#e2c98f] block mb-1">The Objective</strong>
                <p>The goal is to trap the enemy King so that it cannot escape capture. This is called Checkmate.</p>
              </div>
              
              <div>
                <strong className="text-[#e2c98f] block mb-1">The Pieces</strong>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong className="text-[#d8b163]">King:</strong> Moves one square in any direction.</li>
                  <li><strong className="text-[#d8b163]">Queen:</strong> Moves any number of squares diagonally, horizontally, or vertically.</li>
                  <li><strong className="text-[#d8b163]">Rook:</strong> Moves any number of squares horizontally or vertically.</li>
                  <li><strong className="text-[#d8b163]">Bishop:</strong> Moves any number of squares diagonally.</li>
                  <li><strong className="text-[#d8b163]">Knight:</strong> Moves in an 'L' shape (two squares in one direction, then one perpendicular). Can leap over other pieces.</li>
                  <li><strong className="text-[#d8b163]">Pawn:</strong> Moves one square forward (two on its first move). Captures diagonally forward.</li>
                </ul>
              </div>

              <div>
                <strong className="text-[#e2c98f] block mb-1">Special Moves</strong>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong className="text-[#d8b163]">Castling:</strong> A defensive move involving the King and a Rook. The King moves two squares towards the Rook, and the Rook leaps over the King. Neither piece can have moved previously, and the King cannot castle out of, through, or into check.
                  </li>
                  <li>
                    <strong className="text-[#d8b163]">En Passant:</strong> If a Pawn moves two squares forward and lands next to an enemy Pawn, that enemy Pawn can capture it on the very next turn as if it had only moved one square.
                  </li>
                  <li>
                    <strong className="text-[#d8b163]">Promotion:</strong> If a Pawn reaches the opposite end of the board, it must be instantly traded for a Queen, Rook, Bishop, or Knight of the same color.
                  </li>
                </ul>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
