import { useQuery } from "@tanstack/react-query"
import { atom, useAtom } from "jotai"
import { toast } from "sonner"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ActivitiesRepository } from "@/local-db/activities"
import { useSetActivityParent } from "@/local-db/activity-mutations"
import { parentCandidatesQuery } from "@/local-db/activity-queries"

type ParentRequest = {
  activityId: string
  activityKey: string
  hasParent: boolean
}

// The request outlives `open` so the picker stays rendered while the dialog animates closed.
const parentDialogAtom = atom<{ open: boolean; request: ParentRequest | null }>(
  { open: false, request: null }
)

const openParentDialogAtom = atom(null, (_get, set, request: ParentRequest) =>
  set(parentDialogAtom, { open: true, request })
)

type Candidate = Awaited<
  ReturnType<ActivitiesRepository["parentCandidates"]>
>[number]

function ParentPicker({
  request,
  workspaceId,
  onDone,
}: {
  request: ParentRequest
  workspaceId: string
  onDone: () => void
}) {
  const { data: candidates = [] } = useQuery(
    parentCandidatesQuery(workspaceId, request.activityId)
  )
  const setParent = useSetActivityParent(workspaceId)
  const save = (parentId: string | null, message: string) =>
    setParent.mutate(
      { id: request.activityId, parentId },
      {
        onSuccess: () => toast.success(message),
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : "Couldn't set the parent."
          ),
      }
    )

  return (
    <Combobox
      inline
      open
      items={candidates}
      itemToStringLabel={(item: Candidate) => `${item.key} ${item.title}`}
      onValueChange={(item: Candidate | null) => {
        if (!item) return
        save(item.id, `${request.activityKey} is now under ${item.key}`)
        onDone()
      }}
      autoHighlight
    >
      <ComboboxInput
        autoFocus
        showTrigger={false}
        placeholder="Search by ID or title…"
        aria-label="Search activities"
        className="w-full"
      />
      <ComboboxEmpty className="flex empty:hidden">
        No matching activity.
      </ComboboxEmpty>
      <ComboboxList className="max-h-72">
        {(item: Candidate) => (
          <ComboboxItem key={item.id} value={item} className="text-sm">
            <StatusIcon status={item.status} />
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {item.key}
            </span>
            <span dir="auto" className="truncate">
              {item.title || "Untitled"}
            </span>
          </ComboboxItem>
        )}
      </ComboboxList>
      {request.hasParent ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          onClick={() => {
            save(null, `${request.activityKey} has no parent now`)
            onDone()
          }}
        >
          Remove parent
        </Button>
      ) : null}
    </Combobox>
  )
}

function ParentDialog({ workspaceId }: { workspaceId: string }) {
  const [{ open, request }, setDialog] = useAtom(parentDialogAtom)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog({ open: next, request })}
      onOpenChangeComplete={(next) => {
        if (!next) setDialog({ open: false, request: null })
      }}
    >
      <DialogContent className="gap-3">
        <DialogHeader>
          <DialogTitle>Set parent of {request?.activityKey}</DialogTitle>
          <DialogDescription>
            It shows in the parent&apos;s sub-activities and counts toward its
            progress.
          </DialogDescription>
        </DialogHeader>
        {request ? (
          <ParentPicker
            request={request}
            workspaceId={workspaceId}
            onDone={() => setDialog({ open: false, request })}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export { openParentDialogAtom, ParentDialog }
