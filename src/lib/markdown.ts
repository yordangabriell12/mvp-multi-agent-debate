// Simple markdown renderer - handles **bold**, *italic*, `code`, - lists, newlines
export function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic *text*
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code `text`
    .replace(/`([^`]+)`/g, '<code class="bg-surface-inset px-1 py-0.5 rounded text-[13px] font-mono">$1</code>')
    // Headers (### text)
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-ink mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-ink mt-4 mb-1">$1</h2>')
    // Numbered lists
    .replace(/^(\d+)\. (.+)$/gm, '<div class="ml-4 mb-1"><span class="text-ink-muted">$1.</span> $2</div>')
    // Bullet lists
    .replace(/^- (.+)$/gm, '<div class="ml-4 mb-1 before:content-[\"·\"] before:mr-2 before:text-ink-faint">$1</div>')
    // Line breaks
    .replace(/\n/g, '<br />')

  return html
}
