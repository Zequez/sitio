function getLeadingIndentWidth(line: string) {
  let width = 0;

  while (width < line.length) {
    const char = line[width];

    if (char !== " " && char !== "\t") {
      break;
    }

    width += 1;
  }

  return width;
}

export function deindentMarkdownContent(content: string) {
  const lines = content.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim() !== "");

  if (nonEmptyLines.length === 0) {
    return content;
  }

  const minimumIndent = Math.min(
    ...nonEmptyLines.map((line) => getLeadingIndentWidth(line)),
  );

  if (minimumIndent === 0) {
    return content;
  }

  return lines
    .map((line) => {
      const leadingIndentWidth = getLeadingIndentWidth(line);
      return line.slice(Math.min(minimumIndent, leadingIndentWidth));
    })
    .join("\n");
}
