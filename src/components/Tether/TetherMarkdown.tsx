// Lightweight synchronous markdown renderer for Tether's assistant messages
// (ported from Binder's AI-message renderer). No dependencies — handles bold,
// italic, inline code, strikethrough, bullet lists, and blockquotes. Themed with
// BlockOut's CSS tokens.

import { useMemo, type ReactNode } from 'react';

export function TetherMarkdown({ content }: { content: string }) {
  const rendered = useMemo(() => {
    if (!content) return null;

    const lines = content.split('\n');
    const elements: ReactNode[] = [];
    let listItems: string[] = [];
    let key = 0;

    const processInline = (text: string): ReactNode => {
      const parts: ReactNode[] = [];
      const codeRegex = /`([^`]+)`/g;
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      while ((match = codeRegex.exec(text)) !== null) {
        if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
        parts.push(
          <code key={`code-${key++}`} style={{
            background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 4,
            fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '0.88em', color: 'var(--accent)',
          }}>{match[1]}</code>
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) parts.push(text.slice(lastIndex));
      if (parts.length === 0) parts.push(text);

      return (
        <>
          {parts.map((part, idx) => {
            if (typeof part !== 'string') return part;
            let html = escapeHtml(part)
              .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
              .replace(/__(.+?)__/g, '<b>$1</b>')
              .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>')
              .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<i>$1</i>')
              .replace(/~~(.+?)~~/g, '<del>$1</del>');
            return <span key={`t-${key++}-${idx}`} dangerouslySetInnerHTML={{ __html: html }} />;
          })}
        </>
      );
    };

    const flushList = () => {
      if (listItems.length > 0) {
        const items = [...listItems];
        elements.push(
          <ul key={`list-${key++}`} style={{ margin: '6px 0', paddingLeft: 18, listStyleType: 'disc' }}>
            {items.map((item, idx) => (
              <li key={idx} style={{ margin: '3px 0', color: 'var(--text-primary)' }}>{processInline(item)}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    for (const line of lines) {
      const listMatch = line.match(/^(\s*)([-*])\s+(.+)$/);
      const quoteMatch = line.match(/^(\s*)>\s*(.*)$/);
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (listMatch) {
        listItems.push(listMatch[3]);
      } else if (headingMatch) {
        flushList();
        elements.push(
          <div key={key++} style={{ fontWeight: 700, fontSize: '0.98em', margin: '8px 0 4px', color: 'var(--text-primary)' }}>
            {processInline(headingMatch[2])}
          </div>
        );
      } else if (quoteMatch && quoteMatch[2]) {
        flushList();
        elements.push(
          <blockquote key={key++} style={{
            borderLeft: '3px solid var(--border)', paddingLeft: 10, margin: '6px 0',
            color: 'var(--text-secondary)', fontStyle: 'italic',
          }}>{processInline(quoteMatch[2])}</blockquote>
        );
      } else if (line.trim() === '') {
        flushList();
      } else {
        flushList();
        elements.push(
          <p key={key++} style={{ margin: '5px 0', lineHeight: 1.55, color: 'var(--text-primary)' }}>
            {processInline(line)}
          </p>
        );
      }
    }
    flushList();
    return elements;
  }, [content]);

  return <div style={{ wordBreak: 'break-word' }}>{rendered}</div>;
}

// Escape raw HTML so model output can't inject markup; our own <b>/<i>/<del>
// tags are added AFTER this and so survive.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
