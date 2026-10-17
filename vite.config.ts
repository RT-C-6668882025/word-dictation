import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const android = process.env.BUILD_TARGET === 'android';
  const base = android ? './' : '/word-dictation/';

  return {
    base,
    build:{rollupOptions:{input:{main:"index.html",pager:"pager.html"}}},
    plugins: [
      react(),
      ...(!android ? [VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'WordTok',
          short_name: 'WordTok',
          description: '刷词、知识点与默写',
          theme_color: '#111111',
          background_color: '#f4f3ef',
          display: 'standalone',
          start_url: android ? './' : '/word-dictation/'
        }
      })] : [])
    ]
  };
});
