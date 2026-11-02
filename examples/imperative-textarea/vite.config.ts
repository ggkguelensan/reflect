import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@effector/reflect/imperative': resolve(__dirname, '../../dist/imperative.mjs'),
      '@effector/reflect': resolve(__dirname, '../../dist/index.mjs'),
    },
  },
  build: {
    outDir: resolve(__dirname, '../../dist/examples/imperative-textarea'),
  },
});
