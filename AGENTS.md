# AGENTS.md

この文書はAI-Human共同開発で常時守るルールと、
必要なcontextへのルーティングだけを定義する。


## Human

Humanは非エンジニアである。

技術的な説明は専門知識を前提にせず、
Humanが判断できる言葉に噛み砕く。
選択肢・方針・技術判断を提示するときは、
技術的な説明と、専門知識を前提にしない噛み砕いた説明を**併記**する
（どちらか一方に偏らせない）。

現在のHumanの意図を、過去の記録・仮説より優先する。


## Workflow

タスクに対応するworkflowを参照する。

- 初期構想・ニーズ整理
  → `context/workflows/DISCOVERY.md`
- 未知・専門外の領域
  → `context/workflows/UNKNOWN_DOMAIN.md`
- 通常の実装
  → `context/workflows/IMPLEMENTATION.md`
- バグ修正
  → `context/workflows/BUG_FIX.md`
- 大規模変更
  → `context/workflows/LARGE_CHANGE.md`
- 構造上の複雑さが変更・理解・検証を邪魔している
  → `context/workflows/REFACTORING.md`

必要に応じて複数を組み合わせる。


## Refactoring Trigger

以下が繰り返し起きる場合は、構造上の問題を疑い
`context/workflows/REFACTORING.md` を参照する。

- 小さな変更でも多くの箇所を触る
- 同じ修正を複数箇所へ繰り返す
- 同じ構造でバグやHuman介入が繰り返す
- 変更対象や責務の境界が分かりにくい
- 検証・観測が現在の構造のせいで難しい
- 大規模変更の前後で一時的な複雑さが残っている

「もっと綺麗にできる」だけを理由にリファクタリングしない。


## Context

必要なcontextだけを参照する。

- 現在地 → `context/PRODUCT_CURRENT_STATE.md`
- 技術構造 → `context/ARCHITECTURE.md`
- 検証方法 → `context/VERIFY.md`
- 最近の作業 → `context/WORKLOG.md`
- 接続可能性 → `context/CONNECTION_POSSIBILITY_CHECKLIST.md`
- 未確定の案 → `context/IDEAS_AND_HYPOTHESES.md`
- UIの配色・見た目規約 → `context/UI_CONVENTIONS.md`


## 検証ループ

変更後は可能な限りAI自身で検証する。

失敗時は推測修正を繰り返さず、
原因を観測できないなら先に観測手段を改善する。

解決できない場合は上位モデルへの相談を検討する。


## 完了ループ

テストやビルドの成功だけを完了としない。

Humanの目的と残件を再確認し、
AIだけで安全に進められる作業が残っていれば続行する。

Human判断が必要なら「Human確認待ち」とする。


## 記録と改善

一区切りで `context/WORKLOG.md` を更新する。

大きな区切りでは最近のWORKLOGを振り返り、
繰り返す失敗・Human介入・上位モデル相談・高い検証コストから
開発環境の改善候補を探す。

改善候補はHumanへ提示する。
正本文書をAIだけの判断で恒久変更しない。

