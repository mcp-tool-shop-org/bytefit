<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="bytefit" width="380">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

**Pianificatore di configurazioni per LLM locali ottimizzato per l'hardware.** Indica il modello più grande e performante che la tua macchina può effettivamente eseguire in modo efficiente, specificando la quantizzazione, la cache KV, la lunghezza del contesto e la politica di offload, e rifiuta le configurazioni che causerebbero un trasferimento silenzioso dei dati su disco.

bytefit è un **consulente**, non solo uno strumento di stima. Jan e LM Studio ti dicono se un modello *può essere eseguito*; bytefit ti dice cosa *eseguire*: classe del modello + quantizzazione + tipo di cache KV + contesto + politica di offload, e **rifiuta** qualsiasi configurazione che porterebbe a un trasferimento incontrollato dei dati su disco (il che ridurrebbe drasticamente la velocità di elaborazione, di circa 78 volte).

```
decode tok/s  ≈  memory_bandwidth ÷ bytes-read-per-token
```

L'elaborazione è limitata dalla larghezza di banda della memoria. bytefit minimizza il numero di byte letti per token, li mantiene nel livello più veloce possibile, prevede il risultato e rifiuta le configurazioni che causerebbero un trasferimento su disco.

## Guida rapida

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

## Funzionalità

- **Analisi** — VRAM, RAM e *larghezza di banda NVMe misurata* su NVIDIA, AMD e Apple Silicon.
- **Selezione** — classe del modello, famiglia di quantizzazione, tipo di cache KV, lunghezza del contesto e politica di offload per il tuo hardware.
- **Rifiuto** — configurazioni che causerebbero un trasferimento silenzioso dei dati su disco, con una motivazione strutturata e un codice di uscita diverso da zero.
- **Generazione** — argomenti pronti per l'uso per llama.cpp / Ollama / LM Studio e una stima della velocità di elaborazione (token al secondo).

Classifica i modelli **Ollama** installati, analizza una cartella di file `.gguf` (tramite l'opzione `--dir`) o classifica un repository GGUF di **Hugging Face** senza scaricarlo (tramite l'opzione `--hf <repo>`).

## Motivazioni

Le etichette di compatibilità e le stime della memoria sono fondamentali. Nessuno strumento esistente completa il *ciclo decisionale*: raccomandazione di quantizzazione e tipo di cache KV basata sulle caratteristiche dell'hardware, dimensionamento del contesto in base allo spazio disponibile dopo la quantizzazione, raccomandazione della classe del modello e rifiuto categorico del trasferimento su disco. Questa combinazione è bytefit. L'architettura e le evidenze alla base di ogni euristica sono disponibili in [SPEC.md](SPEC.md) e [docs/research-grounding.md](docs/research-grounding.md).

## Requisiti

Node ≥ 20. Opzionale: [Ollama](https://ollama.com) per il catalogo dei modelli installati e llama.cpp / LM Studio per eseguire i comandi generati. Testato su RTX 5090.

## Sicurezza

Nessuna telemetria. Per impostazione predefinita, non utilizza connessioni di rete esterne: il catalogo utilizza l'API loopback locale di Ollama; l'opzione `--hf` (disattivata per impostazione predefinita) recupera le intestazioni GGUF pubbliche da huggingface.co (solo in lettura, i pesi non vengono mai scaricati). Legge i file di modello locali e le informazioni di sistema ed esegue comandi su binari di sistema affidabili (`nvidia-smi`). Le intestazioni GGUF non affidabili vengono verificate. Consultare [SECURITY.md](SECURITY.md).

## Controllo finale prima del rilascio

<!-- SCORECARD:START -->
I controlli fondamentali **A–D sono superati**. Punteggio complessivo **78%** (18/23): gli elementi rimanenti riguardano la rifinitura dell'identità visiva (logo, traduzioni, pagina di destinazione, metadati del repository) e l'etichetta di versione creata al momento del rilascio. Consultare [SHIP_GATE.md](SHIP_GATE.md) o eseguire `npx @mcptoolshop/shipcheck audit` per verificare.
<!-- SCORECARD:END -->

---

MIT © [MCP Tool Shop](https://mcp-tool-shop.github.io/) · [SPEC](SPEC.md) · [CHANGELOG](CHANGELOG.md)
