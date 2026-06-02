<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="bytefit" width="380">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

**一种考虑硬件因素的本地大型语言模型（LLM）配置规划器。** 它会告诉你，你的机器能够实际流畅运行的最大、功能最强大的模型是什么——包括确切的量化、KV缓存、上下文长度和卸载策略——并且会拒绝那些会导致模型悄悄地将数据分页到磁盘上的配置。

bytefit 是一种**顾问**，而不仅仅是一个估算器。Jan 和 LM Studio 告诉你一个模型是否*适合*；bytefit 告诉你应该*运行*什么——模型类别 + 量化 + KV 缓存类型 + 上下文 + 卸载策略——并且**拒绝**任何可能导致失控分页的配置（这将使解码吞吐量降低约 78 倍）。

```
decode tok/s  ≈  memory_bandwidth ÷ bytes-read-per-token
```

解码受内存带宽的限制。bytefit 最小化每个令牌读取的字节数，将数据保存在最快的可用存储层中，预测结果，并拒绝会导致分页的配置。

## 快速入门

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

## 它的作用

- **探测**——VRAM、RAM 以及 NVIDIA、AMD 和 Apple Silicon 上的*实际测量*的 NVMe 带宽。
- **选择**——适用于你的硬件的模型类别、量化系列、KV 缓存类型、上下文长度和卸载策略。
- **拒绝**——那些会导致模型悄悄地将数据分页到磁盘上的配置，并提供结构化的理由和非零的退出代码。
- **输出**——可以直接运行的 llama.cpp / Ollama / LM Studio 参数以及预测的每秒令牌数。

它可以对你已安装的 **Ollama** 模型进行排序，扫描包含 `.gguf` 文件的文件夹（`--dir`），或者对 **Hugging Face** GGUF 仓库进行排序，而无需下载（`--hf <repo>`）。

## 原因

“适合”标签和内存估算是基本要求。没有现有的工具能够完成*决策*过程：基于硬件指纹的量化 + KV 类型推荐，与量化调整的可用空间相关的上下文大小调整，模型类别推荐，以及严格的拒绝分页机制。bytefit 结合了所有这些。
架构以及支持每个启发式方法的证据都可以在 [SPEC.md](SPEC.md) 和 [docs/research-grounding.md](docs/research-grounding.md) 中找到。

## 要求

Node ≥ 20。可选：[Ollama](https://ollama.com)，用于已安装的模型目录，以及 llama.cpp / LM Studio，用于运行输出的命令。已在 RTX 5090 上进行了实际测试。

## 安全性

不收集遥测数据。默认情况下不使用外部网络——目录使用本地 Ollama 环回 API；可选的 `--hf` 标志从 huggingface.co 获取公共 GGUF 标头（默认禁用，仅读取，永远不会下载权重）。读取本地模型文件和系统信息，并调用受信任的系统二进制文件（`nvidia-smi`）。不受信任的 GGUF 标头会进行边界检查。请参阅 [SECURITY.md](SECURITY.md)。

## 发布门

<!-- SCORECARD:START -->
硬性标准 **A–D 通过**。总体 **78%** (18/23)——未完成的项目是发布阶段的身份完善（徽标、翻译、登录页面、仓库元数据）以及在发布时创建的版本标签。请参阅 [SHIP_GATE.md](SHIP_GATE.md)，或运行 `npx @mcptoolshop/shipcheck audit` 进行验证。
<!-- SCORECARD:END -->

---

MIT © [MCP Tool Shop](https://mcp-tool-shop.github.io/) · [SPEC](SPEC.md) · [CHANGELOG](CHANGELOG.md)
