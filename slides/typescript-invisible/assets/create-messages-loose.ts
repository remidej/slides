// Les clés sont inférées, mais les paramètres restent permissifs.
export function createMessages<K extends string>(dictionary: Record<K, string>) {
  function t(key: K, params: Record<string, string | number> = {}): string {
    return dictionary[key].replace(/\{([^{}]+)\}/g, (_, name: string) =>
      String(params[name] ?? `{${name}}`),
    );
  }
  return { t };
}
