import { defineConfig } from 'vite';

// Relative base so the build works when uploaded to CrazyGames (served from a sub-path).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
