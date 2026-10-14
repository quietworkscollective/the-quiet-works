/** Fills `{name}` placeholders in a copy template with values from the page. Unknown names stay as written. */
export function fillCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}
