# Hotspot Routing Web App Plan


## 日本語版計画（JA）

### 背景 / 目的
- 事前に決めたホットスポット（最大10箇所）を選択し、車移動を前提に最短（所要時間最小）で巡回する順序を提案するMVPを、サーバーレス・静的ホスティング（GitHub Pages想定）で実現する。
- MVP段階から交通情報（渋滞）を考慮した所要時間を利用する。

### 要件
- ホットスポット数: 最大10
- 移動手段: 車（DRIVING）
- 対象エリア: シンガポール全域
- デプロイ: GitHub Pagesなどの静的ホスティング
- 予算: 可能な限り安価（API呼び出し最適化・キャッシュ考慮）

### ユーザー体験（UX）
1. ホットスポット一覧（名称＋座標）から複数選択
2. 出発時刻（現在 or 未来日時）と交通モデル（best_guess / pessimistic / optimistic）を選択
3. 「経路計算」ボタン押下
4. 所要時間最小となる巡回順序と区間時間の一覧表示
5. 後段で地図へのルート描画（任意）

### アーキテクチャ
- フロントエンドのみ（クライアントサイド実行）
- 静的ファイル: HTML/CSS/JS、ホットスポットJSON（または埋め込み）
- ルーティング最適化はブラウザ内でヒューリスティック実行

### 技術選定
- 地図・API: Google Maps JavaScript API の DistanceMatrixService（drivingOptionsにdepartureTimeとtrafficModelを指定して、交通状況考慮のduration_in_trafficを取得）
- ルーティング: 近似TSP（例: 最近近傍法＋2-opt改善）をクライアントで実装
- データ管理: JSON（名称、緯度経度、メタ情報）
- UI: 素のHTML/CSS＋軽量JS（必要なら小規模のUIライブラリ）

### セキュリティ / キー運用
- APIキーは「HTTPリファラ制限（ブラウザキー）」＋「API制限（Maps JavaScript API / Distance Matrix API）」を適用
- ローカル検証はhttp(s)オリジンで実施（file://はRefererが送られず制限に引っかかる可能性）
- 本番/開発キーを分離し、使用状況の監視とクォータ制御を行う

### アルゴリズム
- 入力: 選択されたホットスポット集合（最大10）
- 距離行列: DistanceMatrixServiceで所要時間（duration_in_traffic）をペアワイズに取得
- 巡回順序: 近似TSP（最近近傍法で初期解→2-optで改善）
- スタート地点オプション: 固定/自由開始の選択を後で拡張可能

### データモデル（例）
- hotspots: [{ id, name, lat, lng, optional_tags }]
- settings: { departureTimeMode: "now" | "future", futureDateTime: Date?, trafficModel: "best_guess" | "pessimistic" | "optimistic" }
- result: { order: [hotspotId...], segments: [{ fromId, toId, durationSeconds, distanceMeters }] }

### UIデザイン（MVP）
- 左ペイン: ホットスポット選択（チェックボックス）
- 右ペイン: 出発時刻（現在/日時指定）、交通モデル選択、計算ボタン
- 下部: 結果（順序、各区間の所要時間、合計）
- 後段: 地図描画とルートの可視化（DirectionsService）

### デプロイ
- GitHub Pagesにビルド不要の静的ファイルを配置
- ドメイン/サブドメインに合わせてAPIキーのHTTPリファラ制限を設定

### コスト / 運用
- 所要時間行列の呼び出しは要素制限に注意（origins×destinations）。10地点なら分割呼び出しやキャッシュで負荷分散
- 日次クォータや予算アラート設定
- 実使用に合わせたtrafficModel/出発時刻のデフォルト調整

### マイルストーン
1. 設計確定（本計画）
2. 静的UI雛形作成（ホットスポット選択、設定UI）
3. DistanceMatrix連携（交通情報込み所要時間取得）
4. 近似TSP実装（最近近傍＋2-opt）
5. 結果表示＋軽微な地図描画
6. GitHub Pagesデプロイ、APIキー制限適用

### リスクと対応
- API呼び出し制限: バッチ/キャッシュ・必要な分のみ再計算
- 交通推定の誤差: trafficModelや出発時刻を調整、ユーザーに目安である旨を明示
- キー漏えい対策: 厳格なリファラ制限・API制限、監視とローテーション手順

---

## English Plan (EN)

### Background / Goal
- Build a serverless, static MVP (GitHub Pages) that lets users select up to 10 hotspots and proposes the shortest-time driving order around Singapore, using traffic-aware durations from the start.

### Requirements
- Hotspots: up to 10
- Mode: Driving
- Area: Singapore
- Deployment: Static hosting (e.g., GitHub Pages)
- Cost: As low as possible (optimize API calls and cache)

### User Experience (UX)
1. Select multiple hotspots (name + coordinates)
2. Choose departure time (now or future) and traffic model (best_guess / pessimistic / optimistic)
3. Click "Compute Route"
4. Show the optimal visiting order and segment times
5. Optional: Draw route on the map later

### Architecture
- Client-only (runs in browser)
- Static files: HTML/CSS/JS + hotspots JSON
- Heuristic routing computed on the client

### Technology Choices
- Maps & API: Google Maps JavaScript API DistanceMatrixService (use drivingOptions with departureTime and trafficModel to get duration_in_traffic)
- Routing: Approximate TSP (Nearest Neighbor + 2-opt improvement) in the browser
- Data: JSON (name, lat/lng, meta)
- UI: Vanilla HTML/CSS/JS or minimal UI lib

### Security / Key Management
- Apply HTTP referrer restriction (browser key) and API restrictions (Maps JS / Distance Matrix only)
- Test over http(s) origin (avoid file:// which may break referrer)
- Separate prod/dev keys, monitor usage, set quotas

### Algorithm
- Input: selected hotspots (max 10)
- Distance matrix: fetch pairwise duration_in_traffic via DistanceMatrixService
- Order: Approximate TSP (NN init + 2-opt refinement)
- Start point option: support fixed or free start later

### Data Model (example)
- hotspots: [{ id, name, lat, lng, optional_tags }]
- settings: { departureTimeMode: "now" | "future", futureDateTime?: Date, trafficModel: "best_guess" | "pessimistic" | "optimistic" }
- result: { order: [hotspotId...], segments: [{ fromId, toId, durationSeconds, distanceMeters }] }

### UI Design (MVP)
- Left pane: hotspot selection (checkboxes)
- Right pane: departure time (now/future), traffic model, compute button
- Bottom: results (order, segment times, total)
- Later: map drawing with DirectionsService

### Deployment
- Host static files on GitHub Pages
- Configure API key HTTP referrer restrictions for the domain/subdomain

### Cost / Operations
- Respect element limits (origins×destinations). For up to 10 points, split requests and cache results
- Configure daily quotas and budget alerts
- Tune defaults (trafficModel, departureTime) for typical usage

### Milestones
1. Finalize plan (this document)
2. Build static UI skeleton (selection + settings)
3. Integrate DistanceMatrix (traffic-aware durations)
4. Implement approximate TSP (NN + 2-opt)
5. Display results + basic map drawing
6. Deploy to GitHub Pages, enforce key restrictions

### Risks & Mitigations
- API call limits: batching/caching, compute only needed edges
- Traffic estimate variance: adjustable trafficModel/departureTime, set expectations
- Key leakage: strict referrer/API restrictions, monitoring and rotation procedures