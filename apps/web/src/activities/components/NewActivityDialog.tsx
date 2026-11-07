import { Suspense } from "react"
import { useHotkey } from "@tanstack/react-hotkeys"
import { useParams } from "@tanstack/react-router"
import { useAtom } from "jotai"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { newActivityAtom } from "../new-activity"
import { NewActivityForm, type NewActivityWorkspace } from "./NewActivityForm"

function NewActivityDialog({ workspace }: { workspace: NewActivityWorkspace }) {
  const [{ open, request }, setDialog] = useAtom(newActivityAtom)
  const areaParams = useParams({
    from: "/_authenticated/$workspace/_app/areas/$areaId",
    shouldThrow: false,
  })
  useHotkey(
    "C",
    () => {
      // Other dialogs (new area, change type) hold focus while open; C belongs to them then.
      if (document.activeElement?.closest("[role=dialog], [role=alertdialog]"))
        return
      setDialog({
        open: true,
        request: {
          areaId: areaParams?.areaId ?? null,
          goalId: null,
          typeId: null,
          parent: null,
        },
      })
    },
    { enabled: !open }
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog({ open: next, request })}
      onOpenChangeComplete={(next) => {
        if (!next) setDialog({ open: false, request: null })
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[72px] translate-y-0 gap-0 p-0 text-sm max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-h-[90dvh] max-md:max-w-full max-md:translate-x-0 max-md:overflow-y-auto max-md:rounded-b-none sm:max-w-[860px] max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom max-md:data-closed:zoom-out-100 max-md:data-closed:slide-out-to-bottom"
      >
        {request ? (
          <Suspense fallback={<Skeleton className="m-5 h-36" />}>
            <NewActivityForm
              workspace={workspace}
              request={request}
              variant="dialog"
              onClose={() => setDialog({ open: false, request })}
            />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export { NewActivityDialog }
