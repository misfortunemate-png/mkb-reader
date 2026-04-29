// 何を: 画面下部に3秒表示→フェードアウトする軽量トースト（§23）
// なぜ: ファイル読み込みエラー等を console.error だけでなく UI でも通知する

import { useEffect, useState } from 'react';

export default function Toast({ message, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const fadeTimer = setTimeout(() => setVisible(false), 2700);
    const removeTimer = setTimeout(() => onDismiss?.(), 3200);
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className={`toast ${visible ? 'toast-visible' : 'toast-hidden'}`} role="alert">
      {message}
    </div>
  );
}
