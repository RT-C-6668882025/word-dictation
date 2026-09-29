import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const android = process.env.BUILD_TARGET === 'android';
  const base = android ? './' : '/word-dictation/';

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Word Dictation',
          short_name: '默写',
          description: '极简批量单词默写器',
          theme_color: '#111111',
          background_color: '#f4f3ef',
          display: 'standalone',
          start_url: android ? './' : '/word-dictation/'
        }
      })
    ]
  };
});
