// 整页只有一个编辑器，不使用路由。
import { createRoot } from 'react-dom/client'

import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
