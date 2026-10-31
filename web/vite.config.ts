import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  envPrefix: mode === 'demo' ? 'FYRE_DEMO_PUBLIC_' : 'VITE_',
  plugins: [react(), ...(mode === 'demo' ? [{
    name: 'offline-demo',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (id.includes('/styles/global.css')) return code.replace(/@import url\([^)]*\);/g, '');
    },
    transformIndexHtml(html: string) {
      return html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'">`);
    }
  }] : [])]
}));
