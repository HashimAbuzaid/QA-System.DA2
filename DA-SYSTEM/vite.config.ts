import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('\\react\\') ||
            id.includes('\\react-dom\\')
          ) {
            return 'react';
          }

          if (
            id.includes('@supabase/supabase-js') ||
            id.includes('@supabase/auth-js') ||
            id.includes('@supabase/postgrest-js') ||
            id.includes('@supabase/realtime-js') ||
            id.includes('@supabase/storage-js') ||
            id.includes('@supabase/functions-js')
          ) {
            return 'supabase';
          }

          return undefined;
        },
      },
    },
  },
});
