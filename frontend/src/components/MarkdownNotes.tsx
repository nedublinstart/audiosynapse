"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Mic, Presentation } from "lucide-react";
import type { Components } from "react-markdown";
import { TextReveal } from "@/components/TextReveal";

function decorateSources(text: string): React.ReactNode[] {
  const parts = text.split(/(\[(?:Аудио|Слайд|Конспект)[^\]]*\])/g);
  return parts.map((part, i) => {
    if (/^\[Аудио/.test(part)) {
      return (
        <span key={i} className="source-chip">
          <Mic size={12} /> {part.slice(1, -1)}
        </span>
      );
    }
    if (/^\[Слайд/.test(part)) {
      return (
        <span key={i} className="source-chip">
          <Presentation size={12} /> {part.slice(1, -1)}
        </span>
      );
    }
    if (/^\[Конспект/.test(part)) {
      return (
        <span key={i} className="source-chip">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function walkChildren(children: React.ReactNode): React.ReactNode {
  return Array.isArray(children)
    ? children.map((child, idx) => {
        if (typeof child === "string") {
          return <span key={idx}>{decorateSources(child)}</span>;
        }
        return child;
      })
    : typeof children === "string"
      ? decorateSources(children)
      : children;
}

const components: Components = {
  p: ({ children }) => <p>{walkChildren(children)}</p>,
  li: ({ children }) => <li>{walkChildren(children)}</li>,
  strong: ({ children }) => <strong>{walkChildren(children)}</strong>,
  em: ({ children }) => <em>{walkChildren(children)}</em>,
};

export function MarkdownNotes({ content, animate = true }: { content: string; animate?: boolean }) {
  const body = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );

  if (!animate) {
    return <div className="note-prose">{body}</div>;
  }

  return (
    <TextReveal contentKey={content.length} className="note-prose">
      {body}
    </TextReveal>
  );
}

export function exportNotesAsMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printNotesAsPdf() {
  window.print();
}
