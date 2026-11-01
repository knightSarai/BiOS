import { useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "@tanstack/react-router"
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query"
import { PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom"
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react"
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from "jotai"
import { ChevronRight, Ellipsis, Link2, Plus } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ROOT_FOLDER_ID, type DocumentRow, type FolderRow } from "@/local-db/db"
import { notebookTreeQuery } from "@/local-db/notebook-queries"
import { cn } from "@/lib/utils"
import { keyBetween } from "../sort-keys"
import {
  buildTree,
  canMoveFolder,
  indexFolders,
  isJournalFolder,
  pathTo,
  type TreeNode,
} from "../tree"
import { actionSheetAtom, expandedFoldersAtom, renamingAtom } from "./atoms"
import { InlineName } from "./InlineName"
import { DocumentIcon, FolderIcon } from "./ItemIcon"
import {
  ContextRowActions,
  documentActions,
  DropdownRowActions,
  folderActions,
  type RowAction,
} from "./row-actions"
import { useRowHandlers } from "./use-row-handlers"
import { isMovableFolder } from "../use-cases"
import {
  useNotebookActions,
  type NotebookWorkspace,
} from "./use-notebook-actions"

type Node = TreeNode<FolderRow, DocumentRow>

type DropZone = "before" | "after" | "inside"

type DropTarget = { nodeKey: string; zone: DropZone } | null

type DragData = { nodeKey: string }

const dropTargetAtom = atom<DropTarget>(null)

const LONG_PRESS_MS = 500
const INDENT_PX = 12
const ROOT_DROP_ID = "drop:root"

const nodeKeyOf = (node: Node) =>
  node.kind === "folder"
    ? `folder:${node.folder.id}`
    : `document:${node.document.id}`

const NON_DRAG_CONTROLS =
  'input, select, textarea, button, [contenteditable]:not([contenteditable="false"])'

// dnd-kit's default also blocks links, but every row's title is a link.
const sensors = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [
            new PointerActivationConstraints.Delay({
              value: 250,
              tolerance: 5,
            }),
          ]
        : [new PointerActivationConstraints.Distance({ value: 6 })],
    preventActivation: (event) =>
      event.target instanceof Element &&
      event.target.closest(NON_DRAG_CONTROLS) !== null,
  }),
]

type TreeContext = {
  workspace: NotebookWorkspace
  actions: ReturnType<typeof useNotebookActions>
  openIds: Set<string>
  touch: boolean
  onNavigate?: () => void
}

function NotebookTree({
  workspace,
  onNavigate,
}: {
  workspace: NotebookWorkspace
  onNavigate?: () => void
}) {
  const { data } = useQuery(notebookTreeQuery(workspace.id))
  const params = useParams({ strict: false })
  const expanded = useAtomValue(expandedFoldersAtom)
  const store = useStore()
  const setDropTarget = useSetAtom(dropTargetAtom)
  const touch = useMediaQuery("(pointer: coarse)", { noSsr: true })
  const actions = useNotebookActions(workspace)
  if (!data) return null

  const byId = indexFolders(data.folders)
  const currentFolderId =
    params.folderId ??
    data.documents.find((document) => document.id === params.documentId)
      ?.folderId
  const openIds = new Set([
    ...(expanded[workspace.id] ?? []),
    ...(currentFolderId
      ? pathTo(currentFolderId, byId).map((folder) => folder.id)
      : []),
  ])
  const tree = buildTree(data.folders, data.documents)
  const nodesByKey = new Map<string, Node>()
  const collect = (nodes: Node[]) => {
    for (const node of nodes) {
      nodesByKey.set(nodeKeyOf(node), node)
      if (node.kind === "folder") collect(node.children)
    }
  }
  collect(tree)

  const zoneFor = (
    nodeKey: string,
    rect: DOMRect | undefined,
    pointerY: number
  ): DropZone => {
    const node = nodesByKey.get(nodeKey)
    if (!rect || !node) return "inside"
    const offset = (pointerY - rect.top) / rect.height
    if (node.kind === "document") return offset < 0.5 ? "before" : "after"
    if (offset < 0.25) return "before"
    if (offset > 0.75) return "after"
    return "inside"
  }

  // Neighbours are found by position, so two siblings that share a key can't break the drop.
  const siblingKey = (
    kind: "folder" | "document",
    parentId: string,
    anchorId: string,
    zone: "before" | "after",
    movingId: string
  ) => {
    const siblings = (
      kind === "folder"
        ? data.folders.filter((row) => row.parentId === parentId)
        : data.documents.filter((row) => row.folderId === parentId)
    )
      .filter((row) => row.id !== movingId)
      .sort((a, b) =>
        a.sortKey === b.sortKey
          ? a.id.localeCompare(b.id)
          : a.sortKey < b.sortKey
            ? -1
            : 1
      )
    const index = siblings.findIndex((row) => row.id === anchorId)
    if (index === -1) return undefined
    const [low, high] =
      zone === "before"
        ? [siblings[index - 1]?.sortKey ?? null, siblings[index].sortKey]
        : [siblings[index].sortKey, siblings[index + 1]?.sortKey ?? null]
    return low !== null && high !== null && low >= high
      ? undefined
      : keyBetween(low, high)
  }

  const drop = (sourceKey: string, target: DropTarget) => {
    const source = nodesByKey.get(sourceKey)
    if (!source || !target) return
    if (target.nodeKey === ROOT_DROP_ID) {
      if (source.kind === "document") {
        void actions.moveDocumentTo(source.document.id, ROOT_FOLDER_ID)
      } else {
        void actions.moveFolderTo(source.folder.id, ROOT_FOLDER_ID)
      }
      return
    }
    const anchor = nodesByKey.get(target.nodeKey)
    if (!anchor || target.nodeKey === sourceKey) return
    const parentOfAnchor =
      anchor.kind === "folder"
        ? anchor.folder.parentId
        : anchor.document.folderId
    const intoFolderId =
      target.zone === "inside" && anchor.kind === "folder"
        ? anchor.folder.id
        : parentOfAnchor
    const destination = byId.get(intoFolderId)
    if (destination && isJournalFolder(destination.role)) return
    const sameKind = anchor.kind === source.kind
    const sortKey =
      target.zone !== "inside" && sameKind
        ? siblingKey(
            source.kind,
            parentOfAnchor,
            anchor.kind === "folder" ? anchor.folder.id : anchor.document.id,
            target.zone,
            source.kind === "folder" ? source.folder.id : source.document.id
          )
        : undefined
    if (source.kind === "document") {
      void actions.moveDocumentTo(source.document.id, intoFolderId, sortKey)
      return
    }
    if (!isMovableFolder(source.folder)) return
    if (!canMoveFolder(source.folder.id, intoFolderId, byId)) return
    void actions.moveFolderTo(source.folder.id, intoFolderId, sortKey)
  }

  const ctx: TreeContext = { workspace, actions, openIds, touch, onNavigate }

  return (
    <DragDropProvider
      sensors={sensors}
      onDragMove={(event) => {
        const target = event.operation.target
        if (!target) return setDropTarget(null)
        const nodeKey = String(target.id).replace(/^drop:/, "")
        if (target.id === ROOT_DROP_ID) {
          return setDropTarget({ nodeKey: ROOT_DROP_ID, zone: "inside" })
        }
        setDropTarget({
          nodeKey,
          zone: zoneFor(
            nodeKey,
            target.element?.getBoundingClientRect(),
            event.operation.position.current.y
          ),
        })
      }}
      onDragEnd={(event) => {
        const target = store.get(dropTargetAtom)
        setDropTarget(null)
        if (event.canceled) return
        const source = event.operation.source?.data as DragData | undefined
        if (source) drop(source.nodeKey, target)
      }}
    >
      <RootDropZone />
      <ul role="tree" aria-label="Notebook" className="flex flex-col gap-px">
        {tree.map((node) => (
          <TreeRow key={nodeKeyOf(node)} node={node} depth={0} ctx={ctx} />
        ))}
      </ul>
    </DragDropProvider>
  )
}

function RootDropZone() {
  const { ref } = useDroppable({ id: ROOT_DROP_ID })
  const target = useAtomValue(dropTargetAtom)
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "-mt-1 h-2 rounded-full",
        target?.nodeKey === ROOT_DROP_ID && "bg-accent-text/40"
      )}
    />
  )
}

const rowClassName =
  "group/row relative flex min-h-7 items-center gap-1.5 rounded-md pr-1 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground has-[a[data-status=active]]:bg-selection has-[a[data-status=active]]:text-sidebar-accent-foreground max-md:min-h-11"

const rowButtonClassName =
  "relative z-10 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-border hover:text-foreground aria-expanded:bg-sidebar-border aria-expanded:text-foreground max-md:size-9"

function TreeRow({
  node,
  depth,
  ctx,
}: {
  node: Node
  depth: number
  ctx: TreeContext
}) {
  const nodeKey = nodeKeyOf(node)
  const [renaming, setRenaming] = useAtom(renamingAtom)
  const setActionSheet = useSetAtom(actionSheetAtom)
  const dropTarget = useAtomValue(dropTargetAtom)
  const locked =
    ctx.touch || (node.kind === "folder" && !isMovableFolder(node.folder))
  const draggable = useDraggable({
    id: nodeKey,
    data: { nodeKey } satisfies DragData,
    disabled: locked,
  })
  const droppable = useDroppable({ id: `drop:${nodeKey}` })
  const rowElementRef = useRef<Element | null>(null)
  const rowRef = (element: Element | null) => {
    rowElementRef.current = element
    draggable.ref(element)
    droppable.ref(element)
  }

  const kind = node.kind
  const id = kind === "folder" ? node.folder.id : node.document.id
  const title =
    kind === "folder" ? node.folder.name : node.document.title || "Untitled"
  const isOpen = kind === "folder" && ctx.openIds.has(id)
  const isRenaming = renaming?.kind === kind && renaming.id === id
  const zone = dropTarget?.nodeKey === nodeKey ? dropTarget.zone : null
  const handlers = useRowHandlers(
    ctx.workspace,
    { kind, id, title },
    rowElementRef
  )
  const rowActions =
    kind === "folder"
      ? folderActions(handlers, { movable: isMovableFolder(node.folder) })
      : documentActions(handlers)

  const pressTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const longPressedRef = useRef(false)
  const startPress = (element: Element) => {
    if (!ctx.touch) return
    longPressedRef.current = false
    pressTimerRef.current = setTimeout(() => {
      longPressedRef.current = true
      setActionSheet({
        kind,
        id,
        title,
        anchor: element,
        movable: kind === "document" || isMovableFolder(node.folder),
      })
    }, LONG_PRESS_MS)
  }
  const cancelPress = () => clearTimeout(pressTimerRef.current)

  // The context menu passes its children separately, so the element it renders
  // must not carry a children prop of its own, not even an undefined one.
  const renderRow = (children?: React.ReactNode) => (
    <div
      {...(children === undefined ? {} : { children })}
      ref={rowRef}
      role="treeitem"
      aria-expanded={kind === "folder" ? isOpen : undefined}
      data-dragging={draggable.isDragging ? "" : undefined}
      onPointerDown={(event) => startPress(event.currentTarget)}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onClickCapture={(event) => {
        if (!longPressedRef.current) return
        longPressedRef.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
      onContextMenu={(event) => {
        if (ctx.touch) event.preventDefault()
      }}
      onKeyDown={(event) => {
        if (event.key === "F2") {
          event.preventDefault()
          setRenaming({ kind, id })
        }
      }}
      className={cn(
        rowClassName,
        draggable.isDragging && "opacity-40",
        zone === "inside" && "bg-selection ring-1 ring-accent-text",
        zone === "before" &&
          "before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded-full before:bg-accent-text",
        zone === "after" &&
          "after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent-text"
      )}
      style={{ paddingLeft: depth * INDENT_PX + 4 }}
    />
  )

  return (
    <li role="none">
      <RowShell renderRow={renderRow} touch={ctx.touch} actions={rowActions}>
        {kind === "folder" ? (
          <button
            type="button"
            aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
            onClick={() => ctx.actions.toggle(id)}
            className="relative z-10 flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground max-md:size-8"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                isOpen && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span aria-hidden className="w-4 shrink-0 max-md:w-8" />
        )}
        {kind === "folder" ? (
          <FolderIcon role={node.folder.role} open={isOpen} />
        ) : (
          <DocumentIcon
            icon={node.document.icon}
            journal={node.document.journal}
          />
        )}
        {isRenaming ? (
          <InlineName
            defaultValue={kind === "folder" ? title : node.document.title}
            label={kind === "folder" ? "Folder name" : "Document title"}
            onSubmit={(name) => {
              setRenaming(null)
              void ctx.actions.rename(kind, id, name)
            }}
            onCancel={() => setRenaming(null)}
          />
        ) : kind === "folder" ? (
          <Link
            to="/$workspace/notebook/folders/$folderId"
            params={{ workspace: ctx.workspace.slug, folderId: id }}
            onClick={ctx.onNavigate}
            draggable={false}
            className="min-w-0 flex-1 truncate after:absolute after:inset-0"
          >
            {title}
          </Link>
        ) : (
          <Link
            to="/$workspace/documents/$documentId"
            params={{ workspace: ctx.workspace.slug, documentId: id }}
            onClick={ctx.onNavigate}
            draggable={false}
            dir="auto"
            className={cn(
              "min-w-0 flex-1 truncate after:absolute after:inset-0",
              !node.document.title && "text-muted-foreground"
            )}
          >
            {title}
          </Link>
        )}
        {kind === "folder" && node.folder.ownerKey ? (
          <Link2
            role="img"
            aria-label="Used by an area, goal or activity"
            className="size-3 shrink-0 text-accent-text group-hover/row:hidden"
          />
        ) : null}
        <span className="hidden shrink-0 items-center gap-0.5 group-focus-within/row:flex group-hover/row:flex has-aria-expanded:flex max-md:hidden">
          {kind === "folder" ? (
            <button
              type="button"
              aria-label={`New document in ${title}`}
              onClick={handlers.newDocument}
              className={rowButtonClassName}
            >
              <Plus className="size-3.5" />
            </button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`More actions for ${title}`}
                  className={rowButtonClassName}
                />
              }
            >
              <Ellipsis className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownRowActions actions={rowActions} />
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </RowShell>
      {kind === "folder" && isOpen ? (
        <ul role="group" className="flex flex-col gap-px pt-px">
          {node.children.map((child) => (
            <TreeRow
              key={nodeKeyOf(child)}
              node={child}
              depth={depth + 1}
              ctx={ctx}
            />
          ))}
          {node.children.length === 0 ? (
            <li
              role="none"
              className="py-1 text-xs text-muted-foreground"
              style={{ paddingLeft: (depth + 1) * INDENT_PX + 28 }}
            >
              Empty
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}

type RowShellProps = {
  renderRow: (children?: React.ReactNode) => React.ReactElement
  touch: boolean
  actions: RowAction[]
  children: React.ReactNode
}

// Phones use the long-press sheet instead, so the row gets no context menu there.
function RowShell({ renderRow, touch, actions, children }: RowShellProps) {
  if (touch) return renderRow(children)
  return (
    <ContextMenu>
      <ContextMenuTrigger render={renderRow()}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextRowActions actions={actions} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

export { NotebookTree }
