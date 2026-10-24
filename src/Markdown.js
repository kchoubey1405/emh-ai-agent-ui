import { useState } from "react";
import { Check, Copy, FileCode } from "lucide-react";
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

function isDiffBlock(block) {
  if (!block) return false;
  const lang = (block.lang || "").toLowerCase();
  if (lang === "diff" || lang === "patch" || lang === "udiff") return true;
  const text = block.text || "";
  if (text.startsWith("diff --git ") || text.includes("\ndiff --git ")) return true;
  if (/^--- (?:a\/|\/dev\/null)/m.test(text) && /^\+\+\+ (?:b\/|\/dev\/null)/m.test(text)) return true;
  if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(text)) return true;
  return false;
}

function parseDiff(text) {
  const rawLines = String(text).replace(/\r\n/g, "\n").split("\n");
  const files = [];
  let currentFile = null;

  function ensureFile(name) {
    if (!currentFile || (name && currentFile.filePath !== name && currentFile.lines.length > 0)) {
      currentFile = {
        filePath: name || "Proposed changes",
        rawText: "",
        additions: 0,
        deletions: 0,
        lines: []
      };
      files.push(currentFile);
    } else if (name && currentFile.filePath === "Proposed changes") {
      currentFile.filePath = name;
    }
    return currentFile;
  }

  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Detect diff --git a/path b/path
    const gitMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (gitMatch) {
      currentFile = {
        filePath: gitMatch[2] || gitMatch[1],
        rawText: line + "\n",
        additions: 0,
        deletions: 0,
        lines: [{ type: "header", oldNum: null, newNum: null, prefix: " ", content: line }]
      };
      files.push(currentFile);
      continue;
    }

    // Detect --- a/path or +++ b/path
    const minusFileMatch = line.match(/^--- (?:a\/)?(.+)$/);
    const plusFileMatch = line.match(/^\+\+\+ (?:b\/)?(.+)$/);

    if (minusFileMatch && !line.startsWith("--- /dev/null")) {
      ensureFile(minusFileMatch[1].replace(/^[ab]\//, ""));
      currentFile.rawText += line + "\n";
      currentFile.lines.push({ type: "header", oldNum: null, newNum: null, prefix: " ", content: line });
      continue;
    }

    if (plusFileMatch && !line.startsWith("+++ /dev/null")) {
      const fileName = plusFileMatch[1].replace(/^[ab]\//, "");
      ensureFile(fileName);
      currentFile.filePath = fileName;
      currentFile.rawText += line + "\n";
      currentFile.lines.push({ type: "header", oldNum: null, newNum: null, prefix: " ", content: line });
      continue;
    }

    if (line.startsWith("index ") || line.startsWith("new file mode") || line.startsWith("deleted file mode")) {
      const f = ensureFile();
      f.rawText += line + "\n";
      f.lines.push({ type: "header", oldNum: null, newNum: null, prefix: " ", content: line });
      continue;
    }

    // Hunk header: @@ -10,3 +10,4 @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch) {
      const f = ensureFile();
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[3], 10);
      f.rawText += line + "\n";
      f.lines.push({
        type: "hunk",
        oldNum: null,
        newNum: null,
        prefix: "@",
        content: line
      });
      continue;
    }

    const f = ensureFile();
    f.rawText += line + "\n";

    if (line.startsWith("+") && !line.startsWith("+++")) {
      f.additions++;
      f.lines.push({
        type: "add",
        oldNum: null,
        newNum: newLine++,
        prefix: "+",
        content: line.slice(1)
      });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      f.deletions++;
      f.lines.push({
        type: "del",
        oldNum: oldLine++,
        newNum: null,
        prefix: "-",
        content: line.slice(1)
      });
    } else if (line.startsWith("\\")) {
      f.lines.push({
        type: "meta",
        oldNum: null,
        newNum: null,
        prefix: " ",
        content: line
      });
    } else {
      const content = line.startsWith(" ") ? line.slice(1) : line;
      f.lines.push({
        type: "context",
        oldNum: oldLine++,
        newNum: newLine++,
        prefix: " ",
        content
      });
    }
  }

  return files.length > 0 ? files : [{
    filePath: "Proposed Changes",
    rawText: text,
    additions: 0,
    deletions: 0,
    lines: rawLines.map((l) => ({
      type: l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "context",
      oldNum: null,
      newNum: null,
      prefix: l.startsWith("+") ? "+" : l.startsWith("-") ? "-" : " ",
      content: (l.startsWith("+") || l.startsWith("-") || l.startsWith(" ")) ? l.slice(1) : l
    }))
  }];
}

function DiffFileCard({ file }) {
  const [copied, setCopied] = useState(false);

  function copyPatch() {
    try {
      navigator.clipboard.writeText(file.rawText || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="diff-file-card">
      <div className="diff-file-header">
        <div className="diff-file-info">
          <FileCode size={15} className="diff-file-icon" />
          <span className="diff-file-path">{file.filePath}</span>
          <div className="diff-stats-badges">
            {file.additions > 0 && <span className="diff-badge-add">+{file.additions}</span>}
            {file.deletions > 0 && <span className="diff-badge-del">-{file.deletions}</span>}
          </div>
        </div>
        <button type="button" className="diff-copy-btn" onClick={copyPatch} title="Copy file patch">
          {copied ? <Check size={13} className="text-green" /> : <Copy size={13} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <div className="diff-table">
        {file.lines.map((l, idx) => (
          <div key={idx} className={`diff-row diff-row-${l.type}`}>
            <span className="diff-num old-num">{l.oldNum ?? ""}</span>
            <span className="diff-num new-num">{l.newNum ?? ""}</span>
            <span className="diff-sign">{l.prefix || " "}</span>
            <span className="diff-text">{l.content || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiffViewer({ rawText }) {
  const [copiedAll, setCopiedAll] = useState(false);
  const files = parseDiff(rawText);

  const totalAdd = files.reduce((acc, f) => acc + f.additions, 0);
  const totalDel = files.reduce((acc, f) => acc + f.deletions, 0);

  function copyAll() {
    try {
      navigator.clipboard.writeText(rawText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="diff-viewer">
      <div className="diff-viewer-topbar">
        <div className="diff-viewer-title-group">
          <span className="diff-badge">DIFF</span>
          <span className="diff-summary-text">
            {files.length} file{files.length === 1 ? "" : "s"} changed
            {totalAdd > 0 && <span className="diff-summary-add"> (+{totalAdd})</span>}
            {totalDel > 0 && <span className="diff-summary-del"> (-{totalDel})</span>}
          </span>
        </div>
        <button type="button" className="diff-copy-btn" onClick={copyAll} title="Copy full diff">
          {copiedAll ? <Check size={13} className="text-green" /> : <Copy size={13} />}
          <span>{copiedAll ? "Copied diff" : "Copy diff"}</span>
        </button>
      </div>

      <div className="diff-files-list">
        {files.map((file, idx) => (
          <DiffFileCard key={idx} file={file} />
        ))}
      </div>
    </div>
  );
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
            if (isDiffBlock(block)) {
              return <DiffViewer key={key} rawText={block.text} />;
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
