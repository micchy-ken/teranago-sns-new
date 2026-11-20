import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

function resolveBuildBase(): string {
  const explicitBase = (process.env.VITE_BASE_PATH || '').trim();
  if (explicitBase) {
    if (explicitBase === './' || explicitBase === '/') return explicitBase;
    const normalized = explicitBase.startsWith('/') ? explicitBase : `/${explicitBase}`;
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  const ghRepo = (process.env.GITHUB_REPOSITORY || '').trim();
  if (ghRepo && ghRepo.includes('/')) {
    const repoName = ghRepo.split('/')[1];
    if (repoName) {
      return repoName.endsWith('.github.io') ? '/' : `/${repoName}/`;
    }
  }

  // ローカルビルド等のフォールバックは相対パスにし、どの公開パス下でも動作させる
  return './';
}

export default defineConfig(({ command }) => {
  return {
    base: command === 'build' ? resolveBuildBase() : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'lucide-react',
        'motion',
        'exceljs',
        'leaflet',
        'mammoth',
        'xlsx',
      ],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('xlsx')) {
                return 'vendor-xlsx';
              }
              if (id.includes('docx-preview')) {
                return 'vendor-docx';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-lucide';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('react') || id.includes('scheduler')) {
                return 'vendor-react';
              }
            }
          },
        },
      },
      chunkSizeWarningLimit: 1200,
    },
  };
});
