import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const hmrPort = Number(process.env.HMR_PORT);
  const hmr =
    process.env.DISABLE_HMR === 'true'
      ? false
      : Number.isFinite(hmrPort) && hmrPort > 0
        ? { port: hmrPort }
        : true;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-motion': ['motion'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
    server: {
      // HMR can be disabled or moved when multiple local apps are running.
      hmr,
    },
  };
});
