import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base = repo name, so GitHub Pages serves assets from /SkySkiper-GH/.
export default defineConfig({
  base: '/SkySkiper-GH/',
  plugins: [react()],
});
