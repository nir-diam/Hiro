import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { socialCrawlerPreviewProxy } from './vite-social-crawler-proxy';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    return {
      optimizeDeps: {
        include: ['quill', 'tinymce', '@tinymce/tinymce-react'],
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:4000',
            changeOrigin: true,
          },
        },
      },
      plugins: [react(), socialCrawlerPreviewProxy()],
      define: {
        'process.env.API_KEY': JSON.stringify(geminiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
