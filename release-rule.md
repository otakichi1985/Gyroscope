# release-rule.md（Gyroscope固有のリリース方式）

GitHub上のリリース規約（ノート起草・承認・タグ・公開手順）は `context/VERIFY.md` の既存プリセットに従う。ここには自動化されない固有部分だけを残す。

## 配布物（2点。両方必須）

- `gyroscope-portable-vX.Y.Z.zip`：ポータブル配布物一式。
- `gyroscope.exe`（単体）：アプリ内自動更新チェック（`commands/update.rs` の `UPDATE_ASSET_NAME`）がZIPではなくこの名前の単体ファイルを探すため、ZIPだけでは更新が配布されない。

## 生成手順

1. `App/` で `npm run package:portable` を実行する。
2. `App/gyroscope-portable-vX.Y.Z.zip` と `App/dist-portable/gyroscope.exe` が生成されたことを確認する（`gyroscope.exe` は直接実行しない）。
3. `gh release upload <タグ> App/gyroscope-portable-vX.Y.Z.zip App/dist-portable/gyroscope.exe` で添付する。
4. `gh release view <タグ> --json assets --jq ".assets[].name"` で2点の存在を確認する。

## 注意（再発防止の記録）

- `gh release create` はノートのみで成果物を付けない。添付忘れはv0.2.12で実発生した。
- タグはpush済み`main`の先端へ立てる。未pushのまま作成すると別枝へ付く（v0.2.7・v0.2.11で実発生、後者は付け直し済み）。
