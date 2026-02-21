import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // Raise the warning threshold so CI isn't noisy about large chunks
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split heavy vendor libraries into named chunks so the browser can
        // cache them independently of your app code.
        manualChunks: {
          // Firebase SDK — largest single dependency
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/storage',
          ],
          // React ecosystem
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Charting (recharts pulls in d3 — keep separate)
          'vendor-charts': ['recharts'],
          // OCR — huge, only used in admin prescription flow
          'vendor-tesseract': ['tesseract.js'],
          // PDF generation — only used in doctor detail view
          'vendor-pdf': ['jspdf'],
          // Toast notifications
          'vendor-misc': ['react-hot-toast'],
        },
      },
    },
  },

  server: {
    proxy: {
      '/api/claude': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/claude/, '/v1/messages'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const key = req.headers['x-claude-key'];
            if (key) {
              proxyReq.setHeader('x-api-key', key);
              proxyReq.removeHeader('x-claude-key');
            }
            proxyReq.setHeader('anthropic-version', '2023-06-01');
          });
        },
      },
    },
  },
});
