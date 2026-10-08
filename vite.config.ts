import { defineConfig } from 'vite';

export default defineConfig({
  server: { open: false },
  // Allow the build to be served through an ngrok tunnel.
  preview: { allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ngrok.io'] },
});
