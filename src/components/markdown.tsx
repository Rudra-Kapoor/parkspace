import type { ReactNode } from 'react';

/**
 * A small, dependency free Markdown renderer.
 *
 * The legal pages read their text straight from the `docs/` folder, so the app
 * needs a renderer, and pulling a Markdown library plus a sanitiser in for eight
 * static pages is a poor trade. This file covers the subset those documents
 * actually use: headings, paragraphs, lists, blockquotes, pipe tables, fenced
 * code, inline code, bold, italic, links and horizontal rules.
 *
 * Two deliberate design choices:
 *
 * 1. It is a line based parser, not a pile of regular expressions run over the
 *    whole document. Block structure is decided one line at a time, which is
 *    easy to read and easy to extend. Only inline formatting inside a line is
 *    scanned character by character.
 *
 * 2. It produces React elements, never an HTML string, and it never touches
 *    `dangerouslySetInnerHTML`. On top of that, the source is escaped up front,
 *    so any markup an author left in the file is shown as text rather than
 *    interpreted. See `escapeHtml` below.
 */

// ---------------------------------------------------------------------------
// Escaping
//
// `<` and `&` are the only two characters that can open an HTML construct, so
// neutralising those two up front is enough to guarantee no markup survives the
// parse. `>` is left alone because it is the blockquote marker. The entities are
// turned back into plain characters at the very moment a text node is created,
// and React escapes them again on the way out, which is what makes the round
// trip safe.
// ---------------------------------------------------------------------------

function escapeHtml(source: string): string {
  return source.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Block model
// ---------------------------------------------------------------------------

type Align = 'left' | 'center' | 'right';

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'rule' }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'quote'; source: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'table'; header: string[]; align: Align[]; rows: string[][] };

const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*(.*)$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const BULLET = /^( *)[-*+][ \t]+(.*)$/;
const NUMBERED = /^( *)(\d{1,9})[.)][ \t]+(.*)$/;

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/** True when a line opens a block of its own and so cannot continue a paragraph. */
function startsNewBlock(line: string): boolean {
  return (
    HEADING.test(line) ||
    RULE.test(line) ||
    FENCE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    NUMBERED.test(line)
  );
}

function isTableDelimiter(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  return /^[\s:|-]+$/.test(trimmed);
}

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function parseAlignments(line: string): Align[] {
  return splitRow(line).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

/** Removes up to `amount` leading spaces, which is how list item bodies are dedented. */
function dedent(line: string, amount: number): string {
  let index = 0;
  while (index < amount && line[index] === ' ') index++;
  return line.slice(index);
}

type Marker = { indent: number; width: number; content: string; number: number };

function matchMarker(line: string, ordered: boolean): Marker | null {
  if (ordered) {
    const match = NUMBERED.exec(line);
    if (!match) return null;
    const indent = (match[1] ?? '').length;
    const digits = match[2] ?? '1';
    const content = match[3] ?? '';
    return {
      indent,
      width: line.length - content.length - indent,
      content,
      number: Number.parseInt(digits, 10),
    };
  }
  const match = BULLET.exec(line);
  if (!match) return null;
  const indent = (match[1] ?? '').length;
  const content = match[2] ?? '';
  return { indent, width: line.length - content.length - indent, content, number: 1 };
}

/**
 * Collects one list starting at `from`. Item bodies are returned as raw Markdown
 * so that a nested list, or a second paragraph inside an item, can be parsed by
 * recursing into `parseBlocks`.
 */
function collectList(
  lines: string[],
  from: number,
  ordered: boolean,
): { block: Block; next: number } {
  const items: string[] = [];
  let current: string[] | null = null;
  let markerIndent = -1;
  let contentIndent = 2;
  let start = 1;
  let index = from;

  const finishItem = () => {
    if (current) {
      items.push(current.join('\n').replace(/\n+$/, ''));
      current = null;
    }
  };

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (isBlank(line)) {
      const following = lines[index + 1];
      if (following === undefined) break;
      const continues =
        matchMarker(following, ordered) !== null ||
        (!isBlank(following) && following.startsWith(' '.repeat(markerIndent + 2)));
      if (!continues) break;
      if (current) current.push('');
      index++;
      continue;
    }

    const marker = matchMarker(line, ordered);
    if (marker && (markerIndent === -1 || marker.indent <= markerIndent)) {
      if (markerIndent === -1) {
        markerIndent = marker.indent;
        start = marker.number;
      }
      finishItem();
      contentIndent = marker.indent + marker.width;
      current = [marker.content];
      index++;
      continue;
    }

    // An indented line belongs to the item that is open, nested list included.
    if (current && line.startsWith(' '.repeat(markerIndent + 2))) {
      current.push(dedent(line, contentIndent));
      index++;
      continue;
    }

    // A flush line directly under an item is a lazy paragraph continuation.
    if (current && !startsNewBlock(line)) {
      current.push(line.trim());
      index++;
      continue;
    }

    break;
  }

  finishItem();
  return { block: { kind: 'list', ordered, start, items }, next: index };
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (isBlank(line)) {
      index++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1] ?? '```';
      const language = (fence[2] ?? '').trim();
      const body: string[] = [];
      index++;
      while (index < lines.length) {
        const next = lines[index] ?? '';
        index++;
        if (next.trimStart().startsWith(marker)) break;
        body.push(next);
      }
      blocks.push({ kind: 'code', language, code: body.join('\n') });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      index++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const hashes = heading[1] ?? '#';
      const text = (heading[2] ?? '').replace(/\s+#+\s*$/, '').trim();
      blocks.push({ kind: 'heading', level: Math.min(hashes.length, 4), text });
      index++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? '';
        const quoted = QUOTE.exec(current);
        if (quoted) {
          body.push(quoted[1] ?? '');
          index++;
          continue;
        }
        if (isBlank(current) || startsNewBlock(current)) break;
        body.push(current.trim());
        index++;
      }
      blocks.push({ kind: 'quote', source: body.join('\n') });
      continue;
    }

    const delimiter = lines[index + 1];
    if (line.includes('|') && delimiter !== undefined && isTableDelimiter(delimiter)) {
      const header = splitRow(line);
      const align = parseAlignments(delimiter);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const row = lines[index] ?? '';
        if (isBlank(row) || !row.includes('|')) break;
        rows.push(splitRow(row));
        index++;
      }
      blocks.push({ kind: 'table', header, align, rows });
      continue;
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const { block, next } = collectList(lines, index, ordered);
      blocks.push(block);
      index = next;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (isBlank(current)) break;
      if (paragraph.length > 0 && startsNewBlock(current)) break;
      const following = lines[index + 1];
      if (
        paragraph.length > 0 &&
        current.includes('|') &&
        following !== undefined &&
        isTableDelimiter(following)
      ) {
        break;
      }
      paragraph.push(current.trim());
      index++;
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------

const WORD_CHARACTER = /[A-Za-z0-9]/;

/** Finds the index of the delimiter that closes the one at `openIndex`, nesting included. */
function findClosing(text: string, openIndex: number, open: string, close: string): number {
  let depth = 0;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index];
    if (char === open) depth++;
    else if (char === close) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Underscores are only emphasis at a word boundary, so identifiers such as
 * host_commission_pct survive intact even when nobody wrapped them in backticks.
 */
function isEmphasisBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : undefined;
  const after = text[end];
  if (before !== undefined && WORD_CHARACTER.test(before)) return false;
  if (after !== undefined && WORD_CHARACTER.test(after)) return false;
  return true;
}

/** Only schemes that cannot execute script are allowed to become a link. */
function safeHref(target: string): string | null {
  const href = target.trim();
  if (href.length === 0) return null;
  if (href.startsWith('#') || href.startsWith('/')) return href;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  return null;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = '';
  let key = 0;
  let index = 0;

  const flush = () => {
    if (buffer.length > 0) {
      nodes.push(decodeEntities(buffer));
      buffer = '';
    }
  };

  while (index < text.length) {
    const char = text[index];
    if (char === undefined) break;

    // Inline code, which wins over every other marker inside it.
    if (char === '`') {
      let run = 0;
      while (text[index + run] === '`') run++;
      const marker = '`'.repeat(run);
      const closing = text.indexOf(marker, index + run);
      if (closing !== -1) {
        flush();
        nodes.push(
          <code
            key={`${keyPrefix}-c${key++}`}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--accent-text)]"
          >
            {decodeEntities(text.slice(index + run, closing).trim())}
          </code>,
        );
        index = closing + run;
        continue;
      }
    }

    // Links, and images rendered as their alt text.
    if (char === '[' || (char === '!' && text[index + 1] === '[')) {
      const isImage = char === '!';
      const open = isImage ? index + 1 : index;
      const closeBracket = findClosing(text, open, '[', ']');
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = findClosing(text, closeBracket + 1, '(', ')');
        if (closeParen !== -1) {
          const label = text.slice(open + 1, closeBracket);
          const target = text.slice(closeBracket + 2, closeParen).replace(/\s+".*"$/, '');
          const href = isImage ? null : safeHref(target);
          flush();
          if (href === null) {
            // A bare document reference such as 24_Privacy_Policy.md is not a
            // link anyone can follow, so it is shown as plain text.
            nodes.push(
              <span key={`${keyPrefix}-t${key++}`}>{renderInline(label, `${keyPrefix}-t${key}`)}</span>,
            );
          } else {
            const external = /^https?:/i.test(href);
            nodes.push(
              <a
                key={`${keyPrefix}-a${key++}`}
                href={href}
                className="font-medium text-[var(--accent-text)] underline underline-offset-2 hover:no-underline"
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {renderInline(label, `${keyPrefix}-a${key}`)}
              </a>,
            );
          }
          index = closeParen + 1;
          continue;
        }
      }
    }

    if (char === '*' || char === '_') {
      const strong = text[index + 1] === char;
      const marker = strong ? char + char : char;
      const from = index + marker.length;
      const closing = text.indexOf(marker, from);
      const allowed =
        closing > from &&
        (char === '*' || isEmphasisBoundary(text, index, closing + marker.length));
      if (allowed) {
        const inner = text.slice(from, closing);
        flush();
        nodes.push(
          strong ? (
            <strong key={`${keyPrefix}-s${key++}`} className="font-semibold text-[var(--text)]">
              {renderInline(inner, `${keyPrefix}-s${key}`)}
            </strong>
          ) : (
            <em key={`${keyPrefix}-e${key++}`} className="italic">
              {renderInline(inner, `${keyPrefix}-e${key}`)}
            </em>
          ),
        );
        index = closing + marker.length;
        continue;
      }
    }

    buffer += char;
    index++;
  }

  flush();
  return nodes;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-10 mb-4 text-2xl font-bold tracking-tight sm:text-3xl',
  2: 'mt-10 mb-3 border-b border-[var(--border)] pb-2 text-xl font-bold tracking-tight',
  3: 'mt-8 mb-2 text-base font-semibold',
  4: 'mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]',
};

const ALIGN_CLASS: Record<Align, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function renderListItem(body: string, keyPrefix: string): ReactNode {
  const inner = parseBlocks(body);
  const only = inner.length === 1 ? inner[0] : undefined;
  if (only && only.kind === 'paragraph') {
    return renderInline(only.text, keyPrefix);
  }
  return renderBlocks(inner, keyPrefix);
}

function renderBlocks(blocks: Block[], keyPrefix: string): ReactNode[] {
  return blocks.map((block, position) => {
    const key = `${keyPrefix}-${position}`;

    switch (block.kind) {
      case 'heading': {
        const className = HEADING_CLASS[block.level] ?? HEADING_CLASS[4];
        const content = renderInline(block.text, key);
        if (block.level === 1) return <h1 key={key} className={className}>{content}</h1>;
        if (block.level === 2) return <h2 key={key} className={className}>{content}</h2>;
        if (block.level === 3) return <h3 key={key} className={className}>{content}</h3>;
        return <h4 key={key} className={className}>{content}</h4>;
      }

      case 'paragraph':
        return (
          <p key={key} className="my-4 leading-7">
            {renderInline(block.text, key)}
          </p>
        );

      case 'rule':
        return <hr key={key} className="my-8 border-t border-[var(--border)]" />;

      case 'code':
        return (
          <pre
            key={key}
            className="my-5 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-4 text-[0.8125rem] leading-6"
          >
            <code className="font-mono" data-language={block.language || undefined}>
              {decodeEntities(block.code)}
            </code>
          </pre>
        );

      case 'quote':
        return (
          <blockquote
            key={key}
            className="my-5 rounded-r-xl border-l-4 border-[var(--accent)] bg-[var(--surface-sunken)] px-4 py-1 text-[var(--text-muted)]"
          >
            {renderBlocks(parseBlocks(block.source), key)}
          </blockquote>
        );

      case 'list': {
        const itemNodes = block.items.map((item, itemPosition) => (
          <li
            key={`${key}-i${itemPosition}`}
            className="leading-7 [&>p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0"
          >
            {renderListItem(item, `${key}-i${itemPosition}`)}
          </li>
        ));
        return block.ordered ? (
          <ol
            key={key}
            start={block.start}
            className="my-4 list-decimal space-y-2 pl-6 marker:text-[var(--text-muted)]"
          >
            {itemNodes}
          </ol>
        ) : (
          <ul
            key={key}
            className="my-4 list-disc space-y-2 pl-6 marker:text-[var(--text-muted)]"
          >
            {itemNodes}
          </ul>
        );
      }

      case 'table':
        return (
          <div
            key={key}
            className="my-6 w-full overflow-x-auto rounded-xl border border-[var(--border)]"
          >
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead className="bg-[var(--surface-sunken)]">
                <tr>
                  {block.header.map((cell, cellPosition) => (
                    <th
                      key={`${key}-h${cellPosition}`}
                      scope="col"
                      className={`px-3 py-2 font-semibold ${ALIGN_CLASS[block.align[cellPosition] ?? 'left']}`}
                    >
                      {renderInline(cell, `${key}-h${cellPosition}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowPosition) => (
                  <tr key={`${key}-r${rowPosition}`} className="border-t border-[var(--border)]">
                    {row.map((cell, cellPosition) => (
                      <td
                        key={`${key}-r${rowPosition}c${cellPosition}`}
                        className={`px-3 py-2 align-top ${ALIGN_CLASS[block.align[cellPosition] ?? 'left']}`}
                      >
                        {renderInline(cell, `${key}-r${rowPosition}c${cellPosition}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(escapeHtml(source));

  return (
    <div className="min-w-0 text-[0.9375rem] text-[var(--text)] [&>h1:first-child]:mt-0 [&>h2:first-child]:mt-0 [&>p:first-child]:mt-0">
      {renderBlocks(blocks, 'md')}
    </div>
  );
}
