<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="bytefit" width="380">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

**ハードウェアを考慮したローカルLLMの構成プランナー。** 搭載しているマシンで実際にどの程度の大きさで、最も高性能なモデルを問題なく実行できるかを教えてくれます。具体的な量子化、KVキャッシュ、コンテキスト長、およびオフロードポリシーを指定し、ディスクへのサイレントなページングを引き起こす可能性のある構成は拒否します。

bytefitは、単なる推定ツールではなく、**アドバイザー**です。JanやLM Studioは、モデルが「適合するか」を教えてくれますが、bytefitは「何を」実行するかを教えてくれます。モデルクラス＋量子化＋KVキャッシュタイプ＋コンテキスト＋オフロードポリシーを指定し、制御不能なページングにつながる可能性のある構成は**拒否**します（これにより、デコードのスループットが約78倍低下します）。

```
decode tok/s  ≈  memory_bandwidth ÷ bytes-read-per-token
```

デコードはメモリ帯域幅によって制限されます。bytefitは、1トークンあたりの読み取りバイト数を最小限に抑え、最も高速な階層にデータを保持し、結果を予測し、ページングを引き起こす可能性のある構成を拒否します。

## クイックスタート

```bash
npm install -g @mcptoolshop/bytefit

bytefit probe                # what hardware you have
bytefit recommend            # rank your installed Ollama models, best-first
bytefit plan qwen3.6:27b     # a full loadout + ready-to-run llama.cpp / Ollama args
```

```
$ bytefit recommend
NVIDIA GeForce RTX 5090 / 31.8 GiB VRAM / 63.4 GiB RAM — 10 models, 10 runnable:

  qwen3.6:35b-a3b     FITS      Q4_K_M q8_0 ctx8192  ~132 tok/s  [vram]
  mistral-small:24b   FITS      Q4_K_M q8_0 ctx8192  ~84 tok/s  [vram]
  qwen3.6:27b         FITS      Q4_K_M q8_0 ctx8192  ~74 tok/s  [vram]
  gemma4:31b          FITS      Q4_K_M q8_0 ctx8192  ~60 tok/s  [vram]
  ...
```

## 機能概要

- **プローブ** — NVIDIA、AMD、Apple SiliconにおけるVRAM、RAM、および*測定された*NVMe帯域幅。
- **選択** — ハードウェアに最適なモデルクラス、量子化ファミリー、KVキャッシュタイプ、コンテキスト長、およびオフロードポリシー。
- **拒否** — ディスクへのサイレントなページングを引き起こす可能性のある構成。明確な理由とゼロ以外の終了コードを付与します。
- **出力** — 実行可能なllama.cpp / Ollama / LM Studioの引数と、予測されるトークン/秒。

インストールされている**Ollama**モデルを自動的にランク付けしたり、`.gguf`ファイルのフォルダをスキャンしたり（`--dir`）、**Hugging Face**のGGUFリポジトリをダウンロードせずにランク付けしたりできます（`--hf <repo>`）。

## 理由

適合ラベルとメモリ推定は基本的な機能です。既存のツールでは、以下の決定プロセスを完全に実行できません。ハードウェアのフィンガープリントに基づいた量子化＋KVタイプの推奨、量子化によって調整されたヘッドルームに合わせたコンテキストサイズの調整、モデルクラスの推奨、および厳格なページング拒否。これらすべての組み合わせがbytefitです。アーキテクチャと、すべてのヒューリスティックの根拠は、[SPEC.md](SPEC.md)と[docs/research-grounding.md](docs/research-grounding.md)に記載されています。

## 要件

Node ≥ 20。オプション：インストール済みのモデルカタログには[Ollama](https://ollama.com)を、出力されたコマンドを実行するにはllama.cpp / LM Studioを使用します。RTX 5090でテスト済みです。

## セキュリティ

テレメトリーは行いません。デフォルトでは外部ネットワークは使用しません。カタログはローカルのOllamaループバックAPIを使用します。オプションの`--hf`フラグは、huggingface.coからパブリックなGGUFヘッダーを取得します（デフォルトではオフ、読み取り専用、重みはダウンロードされません）。ローカルのモデルファイルとシステム情報を読み取り、信頼できるシステムバイナリ（`nvidia-smi`）を実行します。信頼できないGGUFヘッダーは、境界チェックされます。詳細については、[SECURITY.md](SECURITY.md)を参照してください。

## リリースゲート

<!-- SCORECARD:START -->
ハードゲート**A～Dはすべてパス**。全体で**78%**（18/23）。未完了の項目は、リリースフェーズにおけるアイデンティティの調整（ロゴ、翻訳、ランディングページ、リポジトリメタデータ）と、リリース時に作成されるバージョンタグです。詳細については、[SHIP_GATE.md](SHIP_GATE.md)を参照するか、`npx @mcptoolshop/shipcheck audit`を実行して確認してください。
<!-- SCORECARD:END -->

---

MIT © [MCP Tool Shop](https://mcp-tool-shop.github.io/) · [SPEC](SPEC.md) · [CHANGELOG](CHANGELOG.md)
