import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTheme } from './store/themeStore'

// 与 index.html 的内联脚本对齐：内联脚本负责「首屏那一帧不闪」，
// 这里负责让 React 侧的状态与 <html data-theme> 保持一致（单一真源）。
initTheme()

createRoot(document.getElementById('root')!).render(<App />)