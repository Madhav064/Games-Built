// ============================================================
// Wall Duel — AI Web Worker (keeps the UI smooth while the AI thinks)
// ============================================================

import { getAIMove } from './ai';
import type { AIRequest, AIResponse } from './aiClient';

self.onmessage = (event: MessageEvent<AIRequest>) => {
  const { id, state, playerId, profile } = event.data;
  const response: AIResponse = { id, move: getAIMove(state, playerId, profile) };
  self.postMessage(response);
};
