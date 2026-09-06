import { create } from 'zustand';

// Cross-screen signal so the middle "Send" tab button can open the calendar's send sheet from
// any tab. The button bumps `requestId` (and navigates to the calendar); the calendar watches
// `requestId` and opens its send sheet when it changes. A counter (not a boolean) avoids
// consume/reset races and re-fires cleanly on every press.
export const useSendSheetStore = create<{ requestId: number; requestOpen: () => void }>((set) => ({
  requestId: 0,
  requestOpen: () => set((s) => ({ requestId: s.requestId + 1 })),
}));
