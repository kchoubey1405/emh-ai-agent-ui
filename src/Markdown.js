import { useState } from "react";
import { downloadFile } from "./api";

/**
 * Small dependency-free Markdown renderer for chat answers: headings, tables, lists, code blocks, **bold**, `code`,
 * links and bare URLs. Links to the backend (/api/...) are downloaded through fetch so that they work behind the
 * dev proxy and with CORS; every other link opens in a new tab (only http/https).
 */

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<)]+)/g;

function DownloadLink({ href, children }) {
  const [state, setState] = useState("idle");

  async function onClick(event) {
    event.preventDefault();
    if (state === "busy") {
      return;
    }
    setState("busy");
    try {
      await downloadFile(href);
      setState("idle");
    } catch (error) {
      setState("error");
      // eslint-disable-next-line no-console
      console.error("Download failed", error);
    }
  }

  return (
    <a href={href} onClick={onClick} className={`md-link md-download ${state}`} title="Download">
      {children}
      {state === "busy" ? " (preparing...)" : state === "error" ? " (failed - retry)" : ""}
    </a>
  );
}

function renderInline(text, keyPrefix) {
  const parts = String(text).split(INLINE);
  return parts.map((part, index) => {
    if (!part) {
      return null;
    }
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{renderInline(part.slice(2, -2), key)}</strong>;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      return renderLink(link[2], link[1], key);
    }
    if (/^https?:\/\//.test(part)) {
      return renderLink(part, part, key);
    }
    return part;
  });
}

function renderLink(href, label, key) {
  if (href.startsWith("/api/")) {
    return <DownloadLink key={key} href={href}>{label}</DownloadLink>;
  }
  if (/^https?:\/\//i.test(href)) {
    return (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="md-link">
        {label}
      </a>
    );
  }
  return label;
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

const isTableSeparator = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line || "");
const isTableStart = (lines, i) => lines[i].includes("|") && isTableSeparator(lines[i + 1]);

function parseBlocks(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim().toLowerCase();
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", lang, text: code.join("\n") });
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((cell) => (cell.endsWith(":") ? (cell.startsWith(":") ? "center" : "right") : "left"));
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", header, align, rows });
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !lines[i].trim().startsWith("```")
      && !/^(#{1,4})\s+/.test(lines[i])
      && !isTableStart(lines, i)
      && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraph });
  }

  return blocks;
}

export default function Markdown({ text }) {
  const blocks = parseBlocks(text || "");

  return (
    <div className="md">
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.type) {
          case "heading": {
            const Tag = `h${Math.min(block.level + 2, 6)}`;
            return <Tag key={key} className="md-heading">{renderInline(block.text, key)}</Tag>;
          }
          case "code": {
            if (block.lang === "diff") {
              const diffLines = block.text.split("\n");
              return (
                <div key={key} className="diff-viewer">
                  <div className="diff-header">
                    <span className="diff-badge">DIFF</span>
                    <span className="diff-title">Proposed Code Changes</span>
                  </div>
                  <pre className="md-code diff-code">
                    <code>
                      {diffLines.map((dl, dIdx) => {
                        let cls = "diff-line";
                        if (dl.startsWith("+") && !dl.startsWith("+++")) cls += " diff-add";
                        else if (dl.startsWith("-") && !dl.startsWith("---")) cls += " diff-del";
                        else if (dl.startsWith("@@")) cls += " diff-hunk";
                        else if (dl.startsWith("---") || dl.startsWith("+++")) cls += " diff-file";
                        return <div key={dIdx} className={cls}>{dl || " "}</div>;
                      })}
                    </code>
                  </pre>
                </div>
              );
            }
            return <pre key={key} className="md-code"><code>{block.text}</code></pre>;
          }
          case "table":
            return (
              <div key={key} className="md-table-wrap">
                <table className="md-table">
                  <thead>
                    <tr>
                      {block.header.map((cell, c) => (
                        <th key={`${key}h${c}`} style={{ textAlign: block.align[c] || "left" }}>{renderInline(cell, `${key}h${c}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={`${key}r${r}`}>
                        {row.map((cell, c) => (
                          <td key={`${key}r${r}c${c}`} style={{ textAlign: block.align[c] || "left" }}>{renderInline(cell, `${key}r${r}c${c}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={key} className="md-list">
                {block.items.map((item, n) => <li key={`${key}i${n}`}>{renderInline(item, `${key}i${n}`)}</li>)}
              </Tag>
            );
          }
          default: {
            const whole = block.lines.join(" ").trim();
            const italic = /^_([^_].*)_$/.exec(whole);
            if (italic) {
              return <p key={key} className="md-note">{renderInline(italic[1], key)}</p>;
            }
            return (
              <p key={key}>
                {block.lines.map((line, n) => (
                  <span key={`${key}l${n}`}>
                    {n > 0 && <br />}
                    {renderInline(line, `${key}l${n}`)}
                  </span>
                ))}
              </p>
            );
          }
        }
      })}
    </div>
  );
}
