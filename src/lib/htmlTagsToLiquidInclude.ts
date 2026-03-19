import { deindentMarkdownContent } from "./deindentMarkdownContent.ts";

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
 * {% capture LayoutContent %}<p>World</p>{% endcapture %}
 * {% render "component-Layout", title: "Hello", content: LayoutContent %}
 *
 * {% render "component-Button", size: "lg" %}
 *
```
 */

export function replaceComponents(html: string, tags: string[]) {
  const tagSet = new Set(tags);
  const tagPattern = Array.from(tagSet).join("|");

  if (tagPattern.length === 0) {
    return html;
  }

  const selfClosingTagPattern = new RegExp(
    `<(${tagPattern})\\b([^>]*)\\/>`,
    "g",
  );
  const blockTagPattern = new RegExp(
    `<(${tagPattern})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`,
    "g",
  );

  let result = html.replace(
    selfClosingTagPattern,
    (_, name: string, attrs: string) => {
      const params = parseAttrs(attrs);
      const paramString = paramsToLiquid(params);
      const paramSuffix = paramString ? `, ${paramString}` : "";

      return `{% render "@${name}"${paramSuffix} %}`;
    },
  );

  while (blockTagPattern.test(result)) {
    blockTagPattern.lastIndex = 0;
    result = result.replace(
      blockTagPattern,
      (_, name: string, attrs: string, content: string) => {
        const params = parseAttrs(attrs);
        const paramString = paramsToLiquid(params);
        const contentVar = `${name}Content`;
        const normalizedContent =
          name === "Markdown" ? deindentMarkdownContent(content) : content;
        const contentSuffix = paramString
          ? `, ${paramString}, content: ${contentVar}`
          : `, content: ${contentVar}`;

        return `{% capture ${contentVar} %}${normalizedContent}{% endcapture %}{% render "@${name}"${contentSuffix} %}`;
      },
    );
  }

  return result;
}

function parseAttrs(attrs: string) {
  const params: Record<string, string> = {};

  attrs.replace(/([^\s=]+)\s*=\s*"([^"]*)"/g, (_, k, v) => {
    params[k] = v;
    return "";
  });

  return params;
}
