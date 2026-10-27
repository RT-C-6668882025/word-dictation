import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// These assets are bundled into the Android app by Capacitor.
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: 'index.html', pager: 'pager.html' } } },
  plugins: [react()]
});
