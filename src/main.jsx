// 何を: アプリのエントリポイント
// なぜ: React DOM へのマウントと、Tailwind / 読書スタイルの読み込み
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/reader.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
