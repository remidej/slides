// Vite's raw-asset API, scoped to this deck without changing project config.
declare module '*?raw' {
  const source: string;
  export default source;
}

interface ImportMeta {
  glob<T = unknown>(
    pattern: string | string[],
    options: { query: string; import: string; eager: true },
  ): Record<string, T>;
}
