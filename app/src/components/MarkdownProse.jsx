import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./MarkdownProse.css";

function MarkdownProse({ children, className }) {
  return (
    <div
      className={className ? `markdown-prose ${className}` : "markdown-prose"}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ node: _node, children: linkChildren, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {linkChildren}
            </a>
          ),
        }}
      >
        {String(children || "")}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownProse);
