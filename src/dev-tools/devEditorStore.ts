import { create } from "zustand";

// Dev-only (see App.tsx / SettingsOverlay.tsx gating) -- whether the "edit
// mode" overlay is currently active. A tiny store rather than local state
// so the toggle (Settings) and the overlay itself (mounted at the App
// root) don't need to be siblings passing props.
interface DevEditorState {
  active: boolean;
  toggle: () => void;
}

export const useDevEditorStore = create<DevEditorState>((set) => ({
  active: false,
  toggle: () => set((s) => ({ active: !s.active })),
}));
