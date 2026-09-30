import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.e2b.app'],
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: ['.e2b.app'],
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-runtime',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 10,
            },
            {
              name: 'genlayer-client',
              test: /node_modules[\\/]genlayer-js[\\/]/,
              maxSize: 420_000,
              priority: 5,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              maxSize: 420_000,
              priority: 1,
            },
          ],
        },
      },
    },
  },
});
