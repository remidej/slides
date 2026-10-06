// La version cible, côté auteur. Les pages ne montrent que sa consommation.
// Ajouter ensuite create-messages-1.ts, create-messages-2.ts, etc. dans assets/.
// Tous ces fichiers seront chargés dans le même projet TypeScript virtuel.
type Placeholders<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never;

type Values<S extends string, V> = {
  [Name in Placeholders<S>]: V;
};

type Arguments<S extends string> =
  [Placeholders<S>] extends [never]
    ? []
    : [params: Values<S, string | number>];

export function createMessages<const M extends Record<string, string>>(dictionary: M) {
  function t<const K extends string>(
    key: K & keyof M,
    ...args: K extends keyof M ? Arguments<M[K]> : []
  ): string {
    const params = args[0] as Record<string, string | number> | undefined;
    return dictionary[key].replace(/\{([^{}]+)\}/g, (_, name: string) =>
      String(params?.[name] ?? `{${name}}`),
    );
  }

  return { t };
}
