// Le consommateur décrit le contrat. Les strings ne sont pas analysées.
// Convention : never signifie « aucun paramètre ».
type Arguments<P> = [P] extends [never] ? [] : [params: P];

export function createMessages<
  P extends { [K in keyof P]: Record<string, string | number> | never },
>(dictionary: Record<keyof P, string>) {
  function t<K extends keyof P>(key: K, ...args: Arguments<P[K]>): string {
    const params = args[0] as Record<string, string | number> | undefined;
    return dictionary[key].replace(/\{([^{}]+)\}/g, (_, name: string) =>
      String(params?.[name] ?? `{${name}}`),
    );
  }
  return { t };
}
