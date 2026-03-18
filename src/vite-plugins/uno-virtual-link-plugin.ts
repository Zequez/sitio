import type { Plugin } from "vite";

const UNO_VIRTUAL_LINK_PATTERN =
  /<link\s+[^>]*rel=(["'])stylesheet\1[^>]*href=(["'])virtual:uno\.css\2[^>]*\/?>/gi;

export function unoVirtualLinkPlugin(): Plugin {
  return {
    name: "uno-virtual-link",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(
          UNO_VIRTUAL_LINK_PATTERN,
          '<script type="module">import "virtual:uno.css";</script>',
        );
      },
    },
  };
}
