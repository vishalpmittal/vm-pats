export function renderMarkdown(text) {
    const lines = text.split("\n");
    const out = [];
    let inTable = false;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        // Escape HTML
        line = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            if (inTable) {
                out.push("</table>");
                inTable = false;
            }
            out.push("<hr>");
            continue;
        }
        // Table separator row (|---|---|)
        if (/^\|[\s-:|]+\|$/.test(line.trim()))
            continue;
        // Table header row
        if (/^\|(.+)\|$/.test(line.trim()) && i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1].trim())) {
            if (!inTable) {
                out.push('<table class="md-table">');
                inTable = true;
            }
            const cells = line.trim().slice(1, -1).split("|").map(c => c.trim());
            out.push("<thead><tr>" + cells.map(c => `<th>${applyInline(c)}</th>`).join("") + "</tr></thead><tbody>");
            continue;
        }
        // Table data row
        if (/^\|(.+)\|$/.test(line.trim()) && inTable) {
            const cells = line.trim().slice(1, -1).split("|").map(c => c.trim());
            out.push("<tr>" + cells.map(c => `<td>${applyInline(c)}</td>`).join("") + "</tr>");
            continue;
        }
        // Close table if we leave it
        if (inTable && !/^\|/.test(line.trim())) {
            out.push("</tbody></table>");
            inTable = false;
        }
        // Headings
        if (/^### (.+)$/.test(line)) {
            out.push(`<h3>${applyInline(line.slice(4))}</h3>`);
            continue;
        }
        if (/^## (.+)$/.test(line)) {
            out.push(`<h2>${applyInline(line.slice(3))}</h2>`);
            continue;
        }
        if (/^# (.+)$/.test(line)) {
            out.push(`<h1>${applyInline(line.slice(2))}</h1>`);
            continue;
        }
        // Blockquote
        if (/^&gt; (.+)$/.test(line)) {
            out.push(`<blockquote>${applyInline(line.slice(5))}</blockquote>`);
            continue;
        }
        // List item
        if (/^- (.+)$/.test(line)) {
            out.push(`<li>${applyInline(line.slice(2))}</li>`);
            continue;
        }
        if (/^(\d+)\. (.+)$/.test(line)) {
            const m = line.match(/^\d+\. (.+)$/);
            if (m) {
                out.push(`<li>${applyInline(m[1])}</li>`);
                continue;
            }
        }
        // Empty line = paragraph break
        if (line.trim() === "") {
            out.push("<p></p>");
            continue;
        }
        // Regular text
        out.push(`<p>${applyInline(line)}</p>`);
    }
    if (inTable)
        out.push("</tbody></table>");
    // Wrap consecutive <li> in <ul>
    return out.join("\n")
        .replace(/(<li>.*?<\/li>(?:\s*<li>.*?<\/li>)*)/gs, "<ul>$1</ul>");
}
function applyInline(text) {
    return text
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/(?<!")(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
        .replace(/(?<!["\/])\b((?:linkedin\.com|github\.com)\/[^\s<|]+)/gi, '<a href="https://$1" target="_blank" rel="noopener">$1</a>');
}
