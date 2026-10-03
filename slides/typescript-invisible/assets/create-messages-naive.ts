// Une API typée, mais toutes les chaînes sont acceptées comme clés.
export function createMessages(dictionary: Record<string, string>) {
  function t(key: string): string {
    return dictionary[key] ?? key;
  }
  return { t };
}
