function paramsToLiquid(params: Record<string, string>) {
  return Object.entries(params)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");
}

/**
 *
 * Usage
 *
 * Input:
 *
 * ```html
 * <Layout title="Hello">
 *  <p>World</p>
 *  </Layout>
 *
 *  <Button size="lg" />
 * ```
 *
 * await replaceComponents(html, ["Layout", "Button"])
 *
 * Output:
 * {% include "component-Layout-start" title="Hello" %}
 * <p>World</p>
 * {% include "component-Layout-end" title="Hello" %}
 *
 * {% include "component-Button" size="lg" %}
 *
```
 */

export async function replaceComponents(html: string, tags: string[]) {
  const tagSet = new Set(tags);

  return html.replace(
    /<\/?([A-Z][A-Za-z0-9]*)\b([^>]*)\/?>/g,
    (match, name, attrs) => {
      if (!tagSet.has(name)) return match;

      const params = parseAttrs(attrs);
      const paramString = paramsToLiquid(params);
      const paramSuffix = paramString ? `, ${paramString}` : "";

      if (match.startsWith("</")) {
        return `{% include "component-${name}-end"${paramSuffix} %}`;
      }

      if (match.endsWith("/>")) {
        return `{% include "component-${name}"${paramSuffix} %}`;
      }

      return `{% include "component-${name}-start"${paramSuffix} %}`;
    },
  );
}

function parseAttrs(attrs: string) {
  const params: Record<string, string> = {};

  attrs.replace(/([^\s=]+)\s*=\s*"([^"]*)"/g, (_, k, v) => {
    params[k] = v;
    return "";
  });

  return params;
}
