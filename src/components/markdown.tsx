import { isValidElement, useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export const Markdown = ({ children }: { children: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children, node, ...props }) => <Table {...props}>{children}</Table>,
        pre: ({ children, node, ...props }) => <CodeBlock {...props}>{children}</CodeBlock>,
        a: ({ children, node, ...props }) => {
          return (
            <a {...props} target="_blank">
              {children}
            </a>
          )
        }
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

const Table = ({
  children,
  ...props
}: { children: React.ReactNode } & React.HTMLAttributes<HTMLTableElement>) => {
  return (
    <div className="table-wrapper">
      <table {...props}>{children}</table>
    </div>
  )
}

const CodeBlock = ({
  children,
  ...props
}: { children: React.ReactNode } & React.HTMLAttributes<HTMLPreElement>) => {
  const code = (isValidElement<{ children: string }>(children) && children.props.children) || ""

  const langMatch = /language-(\w+)/.exec((children as any).props.className || "")
  const lang = langMatch ? langMatch[1] : "text"

  const [html, setHtml] = useState<string>(code)

  const setCodeHtml = async (code: string) => {
    const { highlight } = await import("@/lib/highlight")
    const html = highlight(code, lang)
    setHtml(html)
  }

  useEffect(() => {
    setCodeHtml(code)
  }, [code])

  return (
    <pre className="" {...props}>
      <code dangerouslySetInnerHTML={{ __html: html }}></code>
    </pre>
  )
}
