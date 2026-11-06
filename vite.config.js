import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// relative base + hash routing: works on bananalab.id.vn and on hgnhn.github.io/TutorManager/
export default defineConfig({ base: './', plugins: [react()] });
