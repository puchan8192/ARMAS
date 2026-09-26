# Changelog

すべての注目すべき変更はこのファイルに記録します。
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [Unreleased]
### Planned
- Discord通知メッセージへの「参加する／不参加」ボタン追加と、押下結果のDynamoDBへの記録（返信機能）

## [1.0.0] - 2026-09-17
### Added
- カレンダーによる日時選択・予約機能
- 予約時の備考（任意テキスト）入力機能
- Discord Webhookへの予約通知機能（LINE Notifyはサービス終了のため非対応）
- 予約日時のAPEXランクマッチマップ情報表示（api.mozambiquehe.re連携、残り時間のリアルタイムカウントダウン対応）
- ブラウザのlocalStorageによる予約データ・設定の個別保存

## [1.1.0] - 2026-09-17
### Added
- DB接続・返信機能の追加
- 削除確認ダイアログ・キャンセル時のディスコ通知・カレンダ上に予約状況を表示する機能を追加
- 設計書格納

## [1.2.0] - 2026-09-23
### Added
- システム接続人数表示機能の追加

### Changed
- 単一HTMLファイル構成から `frontend/`（index.html, css/, js/）に分割したプロジェクト構成へ移行
- GitHub Pagesでの公開に対応（`.github/workflows/deploy.yml`によるCI/CD）