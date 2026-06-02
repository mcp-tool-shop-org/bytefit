<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="bytefit" width="380">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

**Planificador de configuración local de LLM optimizado para el hardware.** Le indica cuál es el modelo más grande y potente que su máquina puede ejecutar de manera eficiente, con la cuantización, la memoria caché KV, la longitud del contexto y la política de descarga exactas, y rechaza las configuraciones que provocarían el intercambio silencioso de datos al disco.

bytefit es un **asesor**, no solo un estimador. Jan y LM Studio le indican si un modelo *cabe*; bytefit le indica qué *ejecutar*: clase de modelo + cuantización + tipo de memoria caché KV + contexto + política de descarga, y **rechaza** cualquier configuración que pueda provocar un intercambio de datos incontrolado (lo que reduce el rendimiento de la decodificación en aproximadamente 78 veces).

```
decode tok/s  ≈  memory_bandwidth ÷ bytes-read-per-token
```

La decodificación está limitada por el ancho de banda de la memoria. bytefit minimiza los bytes leídos por token, los mantiene en el nivel más rápido que quepa, predice el resultado y rechaza las configuraciones que provocarían el intercambio de datos.

## Inicio rápido

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

## Qué hace

- **Detecta** la VRAM, la RAM y el *ancho de banda NVMe medido* en NVIDIA, AMD y Apple Silicon.
- **Elige** la clase de modelo, la familia de cuantización, el tipo de memoria caché KV, la longitud del contexto y la política de descarga para su hardware.
- **Rechaza** las configuraciones que provocarían el intercambio silencioso de datos al disco, con una razón estructurada y un código de salida distinto de cero.
- **Genera** los argumentos listos para usar de llama.cpp / Ollama / LM Studio y un rendimiento previsto en tokens por segundo.

Clasifica sus modelos **Ollama** instalados, analiza una carpeta de archivos `.gguf` (con la opción `--dir`) o clasifica un repositorio GGUF de **Hugging Face** sin descargarlo (con la opción `--hf <repo>`).

## Por qué

Las etiquetas de compatibilidad y las estimaciones de memoria son requisitos básicos. Ninguna herramienta existente cierra el *ciclo de decisión*: recomendación de cuantización + tipo de memoria caché basada en las características del hardware, ajuste de la longitud del contexto en función del margen disponible ajustado por la cuantización, una recomendación de clase de modelo y un rechazo estricto del intercambio de datos. Esa combinación es bytefit. La arquitectura y la evidencia que respalda cada heurística se encuentran en [SPEC.md](SPEC.md) y [docs/research-grounding.md](docs/research-grounding.md).

## Requisitos

Node ≥ 20. Opcional: [Ollama](https://ollama.com) para el catálogo de modelos instalados, y llama.cpp / LM Studio para ejecutar los comandos generados. Probado en vivo en una RTX 5090.

## Seguridad

No hay telemetría. De forma predeterminada, no hay conexión de red externa: el catálogo utiliza la API de bucle local de Ollama; la opción `--hf` opcional obtiene los encabezados GGUF públicos de huggingface.co (desactivada por defecto, solo lectura, los pesos nunca se descargan). Lee los archivos de modelo locales y la información del sistema, y ejecuta comandos en binarios del sistema de confianza (`nvidia-smi`). Los encabezados GGUF no confiables se verifican para garantizar que estén dentro de los límites. Consulte [SECURITY.md](SECURITY.md).

## Control de calidad antes del lanzamiento

<!-- SCORECARD:START -->
Las pruebas rigurosas **A–D se superan**. En general, **78%** (18/23); los elementos pendientes son el ajuste de la identidad en la fase de lanzamiento (logotipo, traducciones, página de destino, metadatos del repositorio) y la etiqueta de versión creada en el lanzamiento. Consulte [SHIP_GATE.md](SHIP_GATE.md) o ejecute `npx @mcptoolshop/shipcheck audit` para verificar.
<!-- SCORECARD:END -->

---

MIT © [MCP Tool Shop](https://mcp-tool-shop.github.io/) · [SPEC](SPEC.md) · [CHANGELOG](CHANGELOG.md)
