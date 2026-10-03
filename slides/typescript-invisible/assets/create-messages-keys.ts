// Une signature générique : K peut être fourni ou inféré depuis l’objet.
export function createMessages<K extends string>(dictionary: Record<K, string>) {
  function t(key: K): string {
    return dictionary[key];
  }
  return { t };
}
