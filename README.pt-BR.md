<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="bytefit" width="380">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

**Planeador de configuração de LLM local otimizado para o hardware.** Ele informa qual é o modelo mais potente e de maior capacidade que sua máquina pode executar de forma eficiente — com a quantização, o cache KV, o comprimento do contexto e a política de descarregamento exatos — e rejeita configurações que levariam a transferências silenciosas para o disco.

bytefit é um **consultor**, não apenas um estimador. Jan e LM Studio informam se um modelo *cabe*; bytefit informa o que *executar* — classe de modelo + quantização + tipo de cache KV + contexto + política de descarregamento — e **rejeita** qualquer configuração que leve a transferências descontroladas para o disco (o que reduz drasticamente a taxa de transferência de decodificação em cerca de 78 vezes).

```
decode tok/s  ≈  memory_bandwidth ÷ bytes-read-per-token
```

A decodificação é limitada pela largura de banda da memória. bytefit minimiza o número de bytes lidos por token, mantém os dados na camada mais rápida que cabe, prevê o resultado e rejeita configurações que levariam a transferências para o disco.

## Primeiros passos

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

## O que ele faz

- **Verifica** — VRAM, RAM e *largura de banda NVMe medida* em NVIDIA, AMD e Apple Silicon.
- **Escolhe** — classe de modelo, família de quantização, tipo de cache KV, comprimento do contexto e política de descarregamento para o seu hardware.
- **Rejeita** — configurações que levariam a transferências silenciosas para o disco, com uma razão estruturada e um código de saída diferente de zero.
- **Gera** — argumentos prontos para executar para llama.cpp / Ollama / LM Studio e uma taxa de tokens por segundo prevista.

Ele classifica seus modelos **Ollama** instalados, analisa uma pasta de arquivos `.gguf` (`--dir`) ou classifica um repositório GGUF do **Hugging Face** sem baixá-lo (`--hf <repo>`).

## Por quê

Os rótulos de adequação e as estimativas de memória são o mínimo. Nenhuma ferramenta existente fecha o *ciclo de decisão*: recomendação de quantização e tipo de cache otimizada para o hardware, dimensionamento do contexto vinculado à margem ajustada pela quantização, uma recomendação de classe de modelo e uma rejeição rigorosa de transferências para o disco. Essa combinação é bytefit. A arquitetura e as evidências por trás de cada heurística estão em [SPEC.md](SPEC.md) e [docs/research-grounding.md](docs/research-grounding.md).

## Requisitos

Node ≥ 20. Opcional: [Ollama](https://ollama.com) para o catálogo de modelos instalados e llama.cpp / LM Studio para executar os comandos gerados. Testado em um RTX 5090.

## Segurança

Sem telemetria. Por padrão, não há rede externa — o catálogo usa a API de loopback local do Ollama; o sinalizador opcional `--hf` busca cabeçalhos GGUF públicos de huggingface.co (desativado por padrão, somente leitura, os pesos nunca são baixados). Lê arquivos de modelo locais e informações do sistema e executa comandos em binários de sistema confiáveis (`nvidia-smi`). Cabeçalhos GGUF não confiáveis são verificados quanto a limites. Consulte [SECURITY.md](SECURITY.md).

## Barreira de lançamento

<!-- SCORECARD:START -->
As barreiras **A–D são aprovadas**. No geral, **78%** (18/23) — os itens pendentes são o aprimoramento da identidade na fase de lançamento (logotipo, traduções, página de destino, metadados do repositório) e a tag de versão criada no lançamento. Consulte [SHIP_GATE.md](SHIP_GATE.md) ou execute `npx @mcptoolshop/shipcheck audit` para verificar.
<!-- SCORECARD:END -->

---

MIT © [MCP Tool Shop](https://mcp-tool-shop.github.io/) · [SPEC](SPEC.md) · [CHANGELOG](CHANGELOG.md)
