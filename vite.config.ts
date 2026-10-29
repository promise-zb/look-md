import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri 在手机或远程调试时会设置这个地址；本机开发留空即可。
// @ts-expect-error process 是 Node 全局，Vite 配置不走前端的 DOM 类型。
const host = process.env.TAURI_DEV_HOST

export default defineConfig(async () => ({
  plugins: [react()],
  // 别清屏，否则 Rust 的编译错误会被盖住。
  clearScreen: false,
  server: {
    // Tauri 固定连 1420，端口被占就直接失败。
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}))
