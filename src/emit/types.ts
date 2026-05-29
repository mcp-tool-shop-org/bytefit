export type Backend = "llama.cpp" | "ollama" | "lmstudio";

export interface EmittedCommand {
  backend: Backend;
  /** argv (excluding the binary) for CLI backends. */
  args?: string[];
  /** A copy-pasteable command line. */
  commandLine?: string;
  /** Server-wide environment variables (Ollama). */
  env?: Record<string, string>;
  /** Per-request API options (Ollama). */
  options?: Record<string, number | string>;
  /** Loadout dimensions this backend cannot express. */
  warnings: string[];
}

export interface EmitOptions {
  /** Path to the model file (llama.cpp `-m`). A placeholder is used if omitted. */
  modelPath?: string;
  /** llama.cpp binary name (default "llama-server"). */
  binary?: string;
}
