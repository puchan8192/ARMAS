# ローカルサーバー起動手順

開発者向けのドキュメントです。ARMASを手元のPCで動作確認する際の手順をまとめています。

## なぜサーバーを立てる必要があるのか

ARMASのフロントエンド（`frontend/js/`）は、v1.3.0以降ESモジュール（`import`/`export`）で構成されています。ブラウザのセキュリティ仕様上、`index.html`を**ダブルクリックして直接開く（`file://`から始まるURL）とCORSエラーになり、正しく動作しません**。

```
Access to script at 'file:///.../config.js' from origin 'null' has
been blocked by CORS policy
```

このエラーが出た場合は、以下のいずれかの方法でローカルサーバーを立ててからアクセスしてください。

---

## 方法1: Python を使う（追加インストール不要な場合が多い）

1. コマンドプロンプト（ターミナル）を開く
2. `frontend`フォルダに移動する
   ```bash
   cd path\to\ARMAS\frontend
   ```
3. サーバーを起動する
   ```bash
   python -m http.server
   ```
4. 以下のような表示が出れば起動成功です（このウィンドウは閉じずそのままにしておく）
   ```
   Serving HTTP on :: port 8000 (http://[::]:8000/) ...
   ```
5. ブラウザのアドレスバーに直接アクセスする（`index.html`をダブルクリックするのではなく、URLを入力する）
   ```
   http://localhost:8000
   ```

停止する場合は、コマンドプロンプトで `Ctrl + C` を押してください。

---

## 方法2: Node.js を使う

Node.jsがインストール済みの場合は、以下でも起動できます。

```bash
cd path\to\ARMAS\frontend
npx serve
```

表示されたURL（例: `http://localhost:3000`）にブラウザでアクセスしてください。

---

## 注意点

- **必ず`frontend`フォルダの中でサーバーを起動してください**。ARMASのリポジトリ直下で起動すると、`index.html`のパスが `http://localhost:8000/frontend/` のようになります。
- コードを修正したら、ブラウザをリロード（`Ctrl+R` / `Cmd+R`）してください。ブラウザによっては古いキャッシュが残ることがあるため、反映されない場合はスーパーリロード（`Ctrl+Shift+R`）を試してください。
- 本番相当の確認（Supabase・Discord・LINE連携を含めた動作確認）は、最終的に**GitHub Pagesにデプロイされた本番URL**で行うことを推奨します。ローカルサーバーはあくまで「CORSエラーを避けて画面を確認する」ための簡易手段です。
