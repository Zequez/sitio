const FENCED_CODE_BLOCK_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const HTML_BLOCK_PATTERN =
  /<([A-Za-z][\w:-]*)(?:\s[^<>]*?)?>[\s\S]*?<\/\1>/g;
const HTML_SELF_CLOSING_PATTERN =
  /<([A-Za-z][\w:-]*)(?:\s[^<>]*?)?\/>/g;

const MARKDOWN_OPTIONS = {
  noHtmlBlocks: false,
  noHtmlSpans: false,
  tagFilter: false,
};

function toPlaceholder(index: number) {
  return `<!--__SITIO_RAW_HTML_${index}__-->`;
}

function protectHtmlSegment(segment: string, fragments: string[]) {
  const protect = (fragment: string) => {
    const index = fragments.push(fragment) - 1;
    return toPlaceholder(index);
  };

  let protectedSegment = segment.replace(HTML_COMMENT_PATTERN, protect);
  protectedSegment = protectedSegment.replace(HTML_BLOCK_PATTERN, protect);
  protectedSegment = protectedSegment.replace(
    HTML_SELF_CLOSING_PATTERN,
    protect,
  );

  return protectedSegment;
}

function protectHtmlOutsideCodeFences(markdown: string) {
  const fragments: string[] = [];
  let result = "";
  let lastIndex = 0;

  for (const match of markdown.matchAll(FENCED_CODE_BLOCK_PATTERN)) {
    const matchIndex = match.index ?? 0;
    result += protectHtmlSegment(markdown.slice(lastIndex, matchIndex), fragments);
    result += match[0];
    lastIndex = matchIndex + match[0].length;
  }

  result += protectHtmlSegment(markdown.slice(lastIndex), fragments);

  return {
    fragments,
    protectedMarkdown: result,
  };
}

function restoreProtectedHtml(renderedHtml: string, fragments: string[]) {
  return fragments.reduce(
    (result, fragment, index) => result.replaceAll(toPlaceholder(index), fragment),
    renderedHtml,
  );
}

export function renderMarkdownWithHtmlPassthrough(input: string) {
  const { fragments, protectedMarkdown } = protectHtmlOutsideCodeFences(input);
  const renderedHtml = Bun.markdown.html(protectedMarkdown, MARKDOWN_OPTIONS);

  return restoreProtectedHtml(renderedHtml, fragments);
}
