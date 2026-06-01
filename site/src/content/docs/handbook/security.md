---
title: Security
description: What bytefit touches, and what it doesn't.
sidebar:
  order: 4
---

bytefit is a local planning tool. By default it makes no external network requests and emits no
telemetry.

## What it touches

- **Hardware info** via trusted system binaries (`nvidia-smi`) and Node built-ins — read-only.
- **Model metadata** — local GGUF headers and the local Ollama loopback API (`127.0.0.1:11434`).
  Read-only; no auth token is sent.
- **NVMe bandwidth** — a transient read benchmark against a temporary scratch file it creates and
  removes.

## Opt-in network

The `--hf <repo>` flag fetches **public** GGUF headers from huggingface.co over HTTPS using Range
requests — read-only, no credentials, bounded to ≤ 16 MiB per file. Weights are never downloaded. It
is off unless you pass the flag.

## Hardening

- Untrusted GGUF headers are bounds-checked — a malformed file yields a typed error, never a crash or a
  runaway allocation.
- System-binary calls use fixed argument arrays, never shell-string interpolation of input.
- The admission guard fails loud (a structured refusal + non-zero exit), never silently.

Full policy: [SECURITY.md](https://github.com/mcp-tool-shop-org/bytefit/blob/main/SECURITY.md).
