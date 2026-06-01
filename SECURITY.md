# Security Policy

bytefit is a local planning tool. By default it makes no external network requests and emits no telemetry.

## What bytefit does with your system

- **Reads hardware info** via trusted system binaries (`nvidia-smi`) and Node built-ins (`os`) — read-only.
- **Reads model metadata** — GGUF headers and local model catalogs (e.g. `ollama list`). Read-only.
- **Measures NVMe bandwidth** via a transient local read benchmark against a temporary scratch file it creates and removes. No writes outside that scratch path.
- **Emits** configuration and runtime arguments as data. In v1 bytefit recommends; it does not launch inference itself.
- **Talks to a local Ollama daemon** over the loopback API (`127.0.0.1:11434`, or `OLLAMA_HOST`) to list installed models — local only, read-only, no auth token sent.
- **Optionally** — only with `--hf <repo>` — fetches **public** GGUF headers from `huggingface.co` over HTTPS using Range requests. Read-only, no credentials, bounded to ≤16 MiB per file; weights are never downloaded. Off by default.

By default, **no external network**. No telemetry. No persistent state beyond an optional local cache the user controls.

## Threat model

| Threat | Mitigation |
|--------|------------|
| Malformed GGUF / catalog input | Header parser is bounds-checked and returns a typed error, never throws raw |
| Untrusted model metadata | Treated as data; never executed; sizes/params validated before use |
| Subprocess injection | System-binary calls use fixed argument arrays, never shell-string interpolation of user input |
| Silent resource exhaustion | The admission guard refuses configs that would page; it fails loud, not silent |
| Supply chain | Zero production dependencies — only Node built-ins at runtime |
| Opt-in remote fetch (`--hf`) | Off by default; HTTPS to huggingface.co only; Range-bounded header reads (≤16 MiB); no auth/credentials; weights never downloaded |

## Reporting

Open a private security advisory on the [repository](https://github.com/mcp-tool-shop-org/bytefit) or email the maintainer. Please do not file public issues for vulnerabilities.
