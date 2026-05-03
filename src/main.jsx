// 何を: アプリのエントリポイント
// なぜ: React DOM へのマウントと、Tailwind / 読書スタイルの読み込み

// crypto.randomUUID は HTTPS 必須。LAN HTTP（実機開発）では使えないためポリフィル
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    return [...b].map((v, i) => ([4,6,8,10].includes(i)?'-':'')+v.toString(16).padStart(2,'0')).join('');
  };
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/reader.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
