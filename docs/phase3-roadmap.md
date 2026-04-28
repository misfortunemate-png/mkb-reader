# プロダクトA ビューア Phase 3 ロードマップ

作成日: 2026-04-29
PM: クリーデ

---

## Phase 3 全体方針

Phase 1-2で「MDを美しく読むPWAビューア」が完成した。
Phase 3は3段階に分け、「読めるものを増やす」→「書けるようにする」→「つなげる」の順で拡張する。

個々の技術は全て枯れている。ZIP展開、画像表示、テキストエディタ、Google Drive API、JSONパーサ——どれも単体では解かれた問題。それを「自分の営みを鑑賞する場」として統合したものが存在しないだけだ。

---

## Phase 3a — 「読めるものを増やす」

**目標:** テキストも画像も、生成AIの出力も、スキャンした紙も開ける。

| § | 内容 | 状態 |
|---|---|---|
| §10 | HTML/JSON閲覧（横書き固定） | 仕様書作成済 |
| §11 | 画像ビューアモード + CBZ対応 | 仕様書作成済 |
| §12 | 画像リサイズ（保存時に長辺2048pxに制限） | 仕様書作成済 |
| §13 | ページネーション禁則改善 | 仕様書作成済 |

仕様書: spec-phase3a.md / 指示書: instructions-phase3a.md

## Phase 3b — 「書けるようにする」

**目標:** 本棚のファイルを編集し、画像を挿入し、MKBとして出力できる。縦書き表示。

**設計原則:** Phase 3aで導入した非破壊編集モデル（§4.6）に基づく。原本は変更せず、全ての編集をlocalSettings.patches / insertedAssetsとして保存する。MKBエクスポート時にのみパッチを適用してZIPを構築する。

| § | 内容 | リスク | 備考 |
|---|---|---|---|
| §14 | 編集モード仮実装（textarea + MDプレビュー切替） | 中 | パッチ生成・適用ロジック。差分はlocalSettingsに保存 |
| §15 | 画像挿入（ファイルピッカー→insertedAssetsに追加→MD参照パッチ） | 低 | ZIP再構築不要。Blob保存のみ |
| §16 | MKBエクスポート（パッチ適用 + assets統合 → ZIP構築 → .mkbダウンロード） | 低 | エクスポート時の一度だけZIP構築 |
| §17 | 縦書き表示（writing-mode: vertical-rl） | 高 | CSS multi-columnとの組み合わせで検証デプロイ必須 |

## Phase 3c — 「つなげる」

**目標:** チャットログを鑑賞形式に変換し、クラウドストレージを本棚として使える。

| § | 内容 | リスク | 備考 |
|---|---|---|---|
| §18 | チャットログ変換（Claude.ai JSON → mkb） | 中 | 下記フォーマット仕様参照 |
| §19 | Google Drive連携（フォルダブラウズ、開く・保存） | 高 | OAuth認証、GitHub Pages制約 |

### Claude.ai エクスポート形式（§18の入力仕様）

Settings → Privacy → Export Data で取得。メールでZIPが届き、中に `conversations.json` がある。

構造:
```json
[
  {
    "uuid": "a1b2c3d4-...",
    "name": "会話タイトル",
    "created_at": "2025-11-04T09:22:11.000Z",
    "updated_at": "2025-11-04T10:45:03.000Z",
    "model": "claude-3-5-sonnet-20241022",
    "chat_messages": [
      {
        "uuid": "m1m2m3...",
        "sender": "human",
        "text": "メッセージ本文",
        "created_at": "2025-11-04T09:22:11.000Z"
      },
      {
        "uuid": "m4m5m6...",
        "sender": "assistant",
        "text": "応答本文（Markdown形式）",
        "created_at": "2025-11-04T09:22:14.000Z"
      }
    ]
  }
]
```

変換方針（Phase 3cで詳細化）:
- 1会話 = 1 mkbファイル
- index.md に会話全体を話者ごとにスタイリング
- human → 引用ブロック or 右寄せ
- assistant → 通常テキスト
- メタデータ: markbook.yaml に title, model, created_at を記録
- バッチ変換: conversations.json全体を一括変換するUIも検討

### Google Drive連携（§19の技術概要）

方式: Google Drive API v3 + OAuth 2.0
- Google Cloud Consoleでプロジェクト作成、Drive API有効化
- OAuth同意画面設定、クライアントID発行
- GitHub Pages（静的サイト）からのOAuth: リダイレクトURIをGitHub PagesのURLに設定
- PKCE（Proof Key for Code Exchange）フローを使用（SPA向け推奨）
- アクセストークンをメモリ上に保持（localStorageには保存しない）
- リフレッシュトークンは取得できない（SPAの制約）→ セッションごとに再認証

UI:
- 本棚画面に「Google Drive」タブを追加
- Drive内のフォルダ階層をブラウズ
- mkb/md/txt/cbz/画像ファイルをタップで開く（Driveから直接ダウンロード→ビューア）
- 本棚保存: Drive上のファイルをIndexedDBにも保存（オフライン対応）
- MKBエクスポート: 編集したmkbをDriveにアップロード

---

## v0.2以降の候補（優先度低）

- 本棚の本格UI（表紙画像、編集性、特別感のあるデザイン）
- 強調→傍点（圏点）変換
- 引用ブロックのスタイル選択
- 顔文字のフォントフォールバック制御
- 見出し階層の表示カスタマイズ
- ブックマーク・読書進捗
- 引用コピー・注釈ペースト
- 検索機能
