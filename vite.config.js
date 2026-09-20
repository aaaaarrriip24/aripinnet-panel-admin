import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  // Panel dilayani di subdomain sendiri (panel.aripinnet.my.id), jadi base '/'.
  // Kalau nanti dipindah ke sub-path bersama API di satu domain, kembalikan
  // ke '/admin/' DAN ubah juga argumen createWebHistory() di src/router/index.js —
  // keduanya harus sama, kalau tidak halaman tampil kosong setelah refresh.
  base: '/',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Proxy saat dev — hindari urusan CORS sepenuhnya
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
