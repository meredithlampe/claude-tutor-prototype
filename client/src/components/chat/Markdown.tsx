import type { ComponentProps } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { content } from "@/constants/content";

type MarkdownProps = {
  children: string;
};

// Links open in a new tab so a test participant doesn't lose the prototype.
function MarkdownLink({ children, href, title }: ComponentProps<"a"> & ExtraProps) {
  return (
    <a href={href} title={title} target="_blank" rel="noreferrer">
      {children}
      <span className="sr-only"> {content.chat.opensInNewTab}</span>
    </a>
  );
}

// Wide tables scroll inside their own box instead of widening the page.
function MarkdownTable({ children }: ComponentProps<"table"> & ExtraProps) {
  return (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  );
}

const components: Components = {
  a: MarkdownLink,
  table: MarkdownTable,
};

export function Markdown({ children }: MarkdownProps) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
