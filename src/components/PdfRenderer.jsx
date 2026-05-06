// 何を: PDF ファイルを iframe で表示するコンポーネント
// なぜ: §32 D-010 — ブラウザ内蔵 PDF レンダラに委ねることで外部ライブラリ不要
//       ArrayBuffer → Blob → blob URL を生成し、アンマウント時に解放する

import { useEffect, useState } from 'react';

export default function PdfRenderer({ data }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!data) return;
    const blob = new Blob([data], { type: 'application/pdf' });
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [data]);

  if (!url) return null;

  return (
    <iframe
      src={url}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="PDF"
    />
  );
}
