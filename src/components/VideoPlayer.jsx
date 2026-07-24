// 何を: 動画ファイル再生ビューア（§41）
// なぜ: HTML5 video のブラウザネイティブコントロールで再生・一時停止・シーク・全画面・音量をカバー
// 制約: ブラウザが対応しない形式（mkv 等）は error イベントでトーストを表示して警告
import { useEffect, useRef } from 'react';

export default function VideoPlayer({ src, name, onError }) {
  const videoRef = useRef(null);

  // コンポーネント破棄時に再生を停止してリソースを解放
  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (v) { v.pause(); v.src = ''; }
    };
  }, []);

  return (
    <div className="video-frame">
      <video
        ref={videoRef}
        src={src}
        controls
        className="video-player"
        title={name || ''}
        onError={() => onError?.('この形式は再生できません')}
      />
    </div>
  );
}
