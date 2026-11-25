import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Vite ビルド設定（React + Tailwind CSS v4）
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
