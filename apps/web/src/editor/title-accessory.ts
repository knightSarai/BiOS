import { Plugin } from "prosemirror-state"
import { Decoration, DecorationSet } from "prosemirror-view"

const titleAccessoryPlugin = (element: HTMLElement) => {
  // A fresh spec per transaction fails WidgetType.eq and redraws the whole doc.
  const spec = {
    side: -1,
    ignoreSelection: true,
    stopEvent: () => true,
  }
  return new Plugin({
    props: {
      decorations: (state) =>
        DecorationSet.create(state.doc, [
          Decoration.widget(state.doc.child(0).nodeSize, element, spec),
        ]),
    },
  })
}

export { titleAccessoryPlugin }
