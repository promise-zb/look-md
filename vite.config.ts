import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 别清屏，否则 Rust 的编译错误会被盖住。
  clearScreen: false,
  server: {
    // Tauri 固定连 1420，端口被占就直接失败。
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
