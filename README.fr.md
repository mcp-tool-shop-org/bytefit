<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="bytefit" width="380">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/bytefit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

**Planificateur de configuration locale pour LLM, tenant compte du matériel.** Il vous indique le modèle le plus grand et le plus performant que votre machine peut réellement exécuter de manière optimale, avec la quantification, le cache KV, la longueur du contexte et la politique de déchargement exacts, et refuse les configurations qui entraîneraient un accès silencieux au disque.

bytefit est un **conseiller**, et non pas seulement un estimateur. Jan et LM Studio vous indiquent si un modèle *est compatible* ; bytefit vous indique ce que vous devez *exécuter* : classe de modèle + quantification + type de cache KV + contexte + politique de déchargement, et **refuse** toute configuration qui entraînerait un accès incontrôlé au disque (ce qui réduirait considérablement le débit de décodage, d'environ 78 fois).

```
decode tok/s  ≈  memory_bandwidth ÷ bytes-read-per-token
```

Le décodage est limité par la bande passante de la mémoire. bytefit minimise le nombre d'octets lus par jeton, les maintient dans la couche la plus rapide possible, prédit le résultat et refuse les configurations qui entraîneraient un accès au disque.

## Démarrage rapide

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

## Fonctionnement

- **Analyse** : VRAM, RAM et *bande passante NVMe mesurée* pour NVIDIA, AMD et Apple Silicon.
- **Sélection** : classe de modèle, famille de quantification, type de cache KV, longueur du contexte et politique de déchargement pour votre matériel.
- **Refus** : configurations qui entraîneraient un accès silencieux au disque, avec une justification structurée et un code de sortie non nul.
- **Génération** : arguments prêts à l'emploi pour llama.cpp / Ollama / LM Studio et un débit de jetons par seconde (tok/s) prévu.

Il classe vos modèles **Ollama** installés, analyse un dossier de fichiers `.gguf` (avec l'option `--dir`), ou classe un dépôt GGUF de **Hugging Face** sans le télécharger (avec l'option `--hf <repo>`).

## Pourquoi

Les étiquettes de compatibilité et les estimations de mémoire sont des éléments de base. Aucun outil existant ne boucle la *décision* : recommandation de quantification et de type de cache tenant compte du matériel, dimensionnement du contexte lié à la marge de manœuvre ajustée en fonction de la quantification, recommandation de classe de modèle et refus strict de l'accès au disque. Cette combinaison est bytefit. L'architecture et les preuves à l'appui de chaque heuristique se trouvent dans [SPEC.md](SPEC.md) et [docs/research-grounding.md](docs/research-grounding.md).

## Prérequis

Node ≥ 20. Facultatif : [Ollama](https://ollama.com) pour le catalogue des modèles installés, et llama.cpp / LM Studio pour exécuter les commandes générées. Testé en direct sur une RTX 5090.

## Sécurité

Pas de télémétrie. Par défaut, pas de réseau externe : le catalogue utilise l'API locale Ollama ; l'option `--hf` facultative récupère les en-têtes GGUF publics depuis huggingface.co (désactivée par défaut, en lecture seule, les poids ne sont jamais téléchargés). Lit les fichiers de modèle locaux et les informations système, et exécute des programmes système fiables (`nvidia-smi`). Les en-têtes GGUF non fiables sont vérifiés. Voir [SECURITY.md](SECURITY.md).

## Validation avant publication

<!-- SCORECARD:START -->
Les validations **A–D sont réussies**. Score global de **78 %** (18/23) : les éléments en suspens concernent l'amélioration de l'identité lors de la phase de publication (logo, traductions, page d'accueil, métadonnées du dépôt) et l'étiquette de version créée lors de la publication. Voir [SHIP_GATE.md](SHIP_GATE.md) ou exécuter `npx @mcptoolshop/shipcheck audit` pour vérifier.
<!-- SCORECARD:END -->

---

MIT © [MCP Tool Shop](https://mcp-tool-shop.github.io/) · [SPEC](SPEC.md) · [CHANGELOG](CHANGELOG.md)
