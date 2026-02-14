import { rpc, rpcClient } from "@/lib/rpc-client"
import { ChevronRight, File, Folder } from "lucide-react"
import { useTree } from "@headless-tree/react"
import { asyncDataLoaderFeature } from "@headless-tree/core"
import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const COLLAPSED_BY_DEFAULT = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  ".turbo",
  "dist",
  "build",
  ".svelte-kit",
  "__pycache__",
  ".venv",
  "vendor",
  "target"
])

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".css",
  ".scss",
  ".html",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".py",
  ".rb",
  ".rs",
  ".go",
  ".java",
  ".kt",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".swift",
  ".php",
  ".sql",
  ".graphql",
  ".gql",
  ".vue",
  ".svelte",
  ".astro",
  ".env",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
  ".prettierrc",
  ".eslintrc",
  ".lock",
  ".log",
  ".csv",
  ".tsv",
  ".svg",
  ".lua",
  ".zig",
  ".nix",
  ".ml",
  ".mli",
  ".ex",
  ".exs",
  ".erl",
  ".dart",
  ".r",
  ".m",
  ".mm",
  ".pl",
  ".pm"
])

const EXT_TO_LANG: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "jsx",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".swift": "swift",
  ".php": "php",
  ".rb": "ruby",
  ".sql": "sql",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".fish": "bash",
  ".css": "css",
  ".scss": "css",
  ".html": "markup",
  ".xml": "markup",
  ".svg": "markup",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".md": "markdown",
  ".lua": "lua",
  ".zig": "zig",
  ".nix": "nix",
  ".ml": "ocaml",
  ".mli": "ocaml",
  ".ex": "elixir",
  ".exs": "elixir",
  ".dart": "dart",
  ".m": "objectivec",
  ".mm": "objectivec",
  ".docker": "docker",
  ".dockerfile": "docker"
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".")
  if (lastDot === -1) return ""
  return filename.slice(lastDot).toLowerCase()
}

function isTextFile(filename: string): boolean {
  const ext = getFileExtension(filename)
  if (TEXT_EXTENSIONS.has(ext)) return true
  // Files without extensions are often text (Makefile, Dockerfile, etc.)
  const basename = filename.split("/").pop() || filename
  if (
    basename === "Makefile" ||
    basename === "Dockerfile" ||
    basename === "Rakefile" ||
    basename === "Gemfile" ||
    basename === "Procfile" ||
    basename === "LICENSE" ||
    basename === "README" ||
    basename === "CHANGELOG"
  )
    return true
  return false
}

function getLangFromFilename(filename: string): string {
  const ext = getFileExtension(filename)
  const basename = filename.split("/").pop() || filename
  if (basename === "Dockerfile") return "docker"
  if (basename === "Makefile") return "bash"
  return EXT_TO_LANG[ext] || "text"
}

interface FilesSidebarProps {
  agentId?: string
}

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: string
}

function FileContentDialog({
  agentId,
  filePath,
  open,
  onOpenChange
}: {
  agentId: string
  filePath: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const filename = filePath.split("/").pop() || filePath

  const { data, isLoading, isError } = useQuery({
    ...rpc.chat.readWorkspaceFile.queryOptions({
      input: { agentId, path: filePath }
    }),
    enabled: open
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate font-mono text-sm">{filename}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-0">
          {isLoading && (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
          )}
          {isError && (
            <div className="text-sm text-destructive py-4 text-center">Failed to read file</div>
          )}
          {data?.content != null && <HighlightedCode content={data.content} filePath={filePath} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function HighlightedCode({ content, filePath }: { content: string; filePath: string }) {
  const lang = getLangFromFilename(filePath)

  const { data: html } = useQuery({
    queryKey: ["highlight", filePath, content],
    queryFn: async () => {
      if (lang === "text") return null
      const { highlight } = await import("@/lib/highlight")
      return highlight(content, lang)
    }
  })

  return (
    <pre className="text-xs overflow-auto whitespace-pre-wrap rounded-md border p-3 bg-secondary/30">
      {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{content}</code>}
    </pre>
  )
}

function FileTree({ agentId }: { agentId: string }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const tree = useTree<FileNode>({
    rootItemId: "root",
    getItemName: (item) => item.getItemData()?.name ?? "Loading...",
    isItemFolder: (item) => !!item.getItemData()?.isDirectory,
    createLoadingItemData: () => ({
      name: "Loading...",
      path: "",
      isDirectory: false,
      size: 0,
      modifiedAt: ""
    }),
    initialState: {
      expandedItems: ["root"]
    },
    onLoadedChildren: (itemId, childrenIds) => {
      if (itemId === "root") {
        // Auto-expand top-level folders except noisy ones
        for (const childId of childrenIds) {
          const item = tree.getItemInstance(childId)
          const data = item.getItemData()
          if (data?.isDirectory && !COLLAPSED_BY_DEFAULT.has(data.name)) {
            item.expand()
          }
        }
      }
    },
    dataLoader: {
      getItem: async (itemId) => {
        if (itemId === "root") {
          return {
            name: "root",
            path: "",
            isDirectory: true,
            size: 0,
            modifiedAt: ""
          }
        }
        // Item data is populated via getChildrenWithData
        // This fallback shouldn't normally be hit
        return {
          name: itemId.split("/").pop() || itemId,
          path: itemId,
          isDirectory: false,
          size: 0,
          modifiedAt: ""
        }
      },
      getChildrenWithData: async (itemId) => {
        const path = itemId === "root" ? undefined : itemId
        const files = await rpcClient.chat.getWorkspaceFiles({
          agentId,
          path
        })
        return files.map((file) => ({
          id: file.path,
          data: file
        }))
      }
    },
    features: [asyncDataLoaderFeature]
  })

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
  }

  const treeRef = useRef(tree)
  treeRef.current = tree

  useEffect(() => {
    const onFocus = () => {
      const t = treeRef.current
      for (const item of t.getItems()) {
        if (item.isFolder() && item.isExpanded()) {
          item.invalidateChildrenIds(true)
        }
      }
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  const items = tree.getItems()

  return (
    <>
      <div {...tree.getContainerProps()}>
        {items.map((item) => {
          if (item.getId() === "root") return null

          const itemData = item.getItemData()
          if (!itemData || item.isLoading()) {
            return (
              <div
                key={item.getId()}
                className="px-3 py-1.5 text-sm text-muted-foreground"
                style={{ paddingLeft: `${item.getItemMeta().level * 12}px` }}
              >
                Loading...
              </div>
            )
          }

          const props = item.getProps()
          return (
            <button
              {...props}
              key={item.getId()}
              className="w-full px-3 py-1.5 rounded-md text-sm hover:bg-secondary/50 transition-colors text-left"
              style={{ paddingLeft: `${item.getItemMeta().level * 12}px` }}
              onClick={(e) => {
                if (item.isFolder() && !item.isExpanded() && item.hasLoadedData()) {
                  item.invalidateChildrenIds(true)
                }
                props.onClick?.(e)
                if (!item.isFolder()) {
                  if (isTextFile(itemData.name)) {
                    setSelectedFile(itemData.path)
                  } else {
                    rpcClient.chat.revealWorkspaceFile({
                      agentId,
                      path: itemData.path
                    })
                  }
                }
              }}
            >
              <div className="flex items-center gap-2">
                {item.isFolder() ? (
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${
                      item.isExpanded() ? "rotate-90" : ""
                    }`}
                  />
                ) : (
                  <span className="w-3.5" />
                )}
                {item.isFolder() ? (
                  <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{item.getItemName()}</div>
                  {!item.isFolder() && (
                    <div className="text-xs text-muted-foreground">
                      {formatFileSize(itemData.size)}
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selectedFile && (
        <FileContentDialog
          agentId={agentId}
          filePath={selectedFile}
          open={!!selectedFile}
          onOpenChange={(open) => {
            if (!open) setSelectedFile(null)
          }}
        />
      )}
    </>
  )
}

export function FilesSidebar({ agentId }: FilesSidebarProps) {
  return (
    <div className="w-64 border-l shrink-0 flex flex-col bg-background">
      {/* Header */}
      <div className="h-10 flex items-center border-b px-3">
        <span className="text-sm font-medium">Workspace Files</span>
      </div>

      {/* Files List */}
      <div className="flex-1 overflow-y-auto p-2">
        {!agentId ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No agent selected</div>
        ) : (
          <FileTree key={agentId} agentId={agentId} />
        )}
      </div>
    </div>
  )
}
