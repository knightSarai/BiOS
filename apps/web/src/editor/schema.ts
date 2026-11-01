import { Schema, type DOMOutputSpec, type Node } from "prosemirror-model"
import { isSafeHref } from "./links"

const blockId = { id: { default: null as string | null } }

const idFromDom = (dom: HTMLElement | string) =>
  typeof dom === "string" ? {} : { id: dom.getAttribute("data-block-id") }

const textBlock = "my-1 min-h-6 leading-6"

const blockIdOf = (node: Node) => node.attrs.id as string | null

const isMermaidPre = (dom: HTMLElement) =>
  dom.hasAttribute("data-mermaid") ||
  dom.getAttribute("lang") === "mermaid" ||
  dom.querySelector(":scope > code.language-mermaid") !== null

const schema = new Schema({
  nodes: {
    doc: { content: "title block+" },
    title: {
      content: "text*",
      marks: "",
      defining: true,
      parseDOM: [{ tag: "h1[data-title]" }],
      toDOM: () => [
        "h1",
        {
          "data-title": "",
          dir: "auto",
          class: "mb-4 text-3xl leading-10 font-semibold tracking-tight",
        },
        0,
      ],
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: blockId,
      parseDOM: [{ tag: "p", getAttrs: idFromDom }],
      toDOM: (node) => [
        "p",
        { "data-block-id": blockIdOf(node), dir: "auto", class: textBlock },
        0,
      ],
    },
    heading: {
      group: "block",
      content: "inline*",
      defining: true,
      attrs: { ...blockId, level: { default: 1 } },
      parseDOM: [1, 2, 3].map((level) => ({
        tag: `h${level}`,
        getAttrs: (dom: HTMLElement | string) => ({ ...idFromDom(dom), level }),
      })),
      toDOM: (node) => [
        `h${node.attrs.level}`,
        {
          "data-block-id": blockIdOf(node),
          dir: "auto",
          class: headingClass(node),
        },
        0,
      ],
    },
    blockquote: {
      group: "block",
      content: "paragraph+",
      defining: true,
      attrs: blockId,
      parseDOM: [{ tag: "blockquote", getAttrs: idFromDom }],
      toDOM: (node) => [
        "blockquote",
        {
          "data-block-id": blockIdOf(node),
          class: "my-2 border-l-2 border-border pl-4 text-muted-foreground",
        },
        0,
      ],
    },
    code_block: {
      group: "block",
      content: "text*",
      marks: "",
      code: true,
      defining: true,
      attrs: { ...blockId, language: { default: "" } },
      parseDOM: [
        { tag: "pre", preserveWhitespace: "full", getAttrs: idFromDom },
      ],
      toDOM: (node) => [
        "pre",
        {
          "data-block-id": blockIdOf(node),
          dir: "ltr",
          class:
            "my-2 overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono text-[13px] leading-5",
        },
        ["code", 0],
      ],
    },
    mermaid: {
      group: "block",
      content: "text*",
      marks: "",
      code: true,
      defining: true,
      attrs: blockId,
      parseDOM: [
        {
          tag: "pre",
          priority: 60,
          preserveWhitespace: "full",
          getAttrs: (dom: HTMLElement | string) =>
            typeof dom !== "string" && isMermaidPre(dom)
              ? idFromDom(dom)
              : false,
        },
      ],
      toDOM: (node) => [
        "pre",
        {
          "data-block-id": blockIdOf(node),
          "data-mermaid": "",
          dir: "ltr",
          class:
            "my-2 overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono text-[13px] leading-5",
        },
        ["code", 0],
      ],
    },
    horizontal_rule: {
      group: "block",
      attrs: blockId,
      parseDOM: [{ tag: "hr", getAttrs: idFromDom }],
      toDOM: (node) => [
        "div",
        { "data-block-id": blockIdOf(node), class: "py-3" },
        ["hr", { class: "border-border" }],
      ],
    },
    drawing: {
      group: "block",
      atom: true,
      selectable: true,
      attrs: {
        ...blockId,
        drawingId: { default: null as string | null },
        // Shapes travel with a copied block, so pasting into another
        // document (its own Y.Doc) still has the drawing.
        snapshot: { default: null as string | null },
      },
      parseDOM: [
        {
          tag: "div[data-drawing-id]",
          getAttrs: (dom: HTMLElement | string) =>
            typeof dom === "string"
              ? false
              : {
                  ...idFromDom(dom),
                  drawingId: dom.getAttribute("data-drawing-id"),
                  snapshot: dom.getAttribute("data-drawing-snapshot"),
                },
        },
      ],
      toDOM: (node) => [
        "div",
        {
          "data-block-id": blockIdOf(node),
          "data-drawing-id": node.attrs.drawingId as string | null,
          "data-drawing-snapshot": node.attrs.snapshot as string | null,
          class: "my-2 min-h-24 rounded-md border border-border",
        },
      ],
    },
    bullet_list: {
      group: "block",
      content: "list_item+",
      attrs: blockId,
      parseDOM: [{ tag: "ul:not([data-checklist])", getAttrs: idFromDom }],
      toDOM: (node) => [
        "ul",
        {
          "data-block-id": blockIdOf(node),
          class: "my-1 list-disc pl-6 marker:text-muted-foreground",
        },
        0,
      ],
    },
    ordered_list: {
      group: "block",
      content: "list_item+",
      attrs: { ...blockId, order: { default: 1 } },
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (dom: HTMLElement | string) => ({
            ...idFromDom(dom),
            order:
              typeof dom === "string"
                ? 1
                : Number(dom.getAttribute("start") ?? 1),
          }),
        },
      ],
      toDOM: (node) => [
        "ol",
        {
          "data-block-id": blockIdOf(node),
          start: node.attrs.order === 1 ? null : (node.attrs.order as number),
          class: "my-1 list-decimal pl-6 marker:text-muted-foreground",
        },
        0,
      ],
    },
    list_item: {
      content: "paragraph block*",
      defining: true,
      attrs: blockId,
      parseDOM: [
        { tag: "ul:not([data-checklist]) > li, ol > li", getAttrs: idFromDom },
      ],
      toDOM: (node) => [
        "li",
        { "data-block-id": blockIdOf(node), class: "pl-1 [&>p]:my-0.5" },
        0,
      ],
    },
    task_list: {
      group: "block",
      content: "task_item+",
      attrs: blockId,
      parseDOM: [{ tag: "ul[data-checklist]", getAttrs: idFromDom }],
      toDOM: (node) => [
        "ul",
        {
          "data-block-id": blockIdOf(node),
          "data-checklist": "",
          class: "my-1",
        },
        0,
      ],
    },
    task_item: {
      content: "paragraph block*",
      defining: true,
      attrs: { ...blockId, checked: { default: false } },
      parseDOM: [
        {
          tag: "ul[data-checklist] > li",
          getAttrs: (dom: HTMLElement | string) => ({
            ...idFromDom(dom),
            checked:
              typeof dom !== "string" && dom.hasAttribute("data-checked"),
          }),
        },
      ],
      toDOM: (node) => [
        "li",
        {
          "data-block-id": blockIdOf(node),
          "data-checked": node.attrs.checked ? "" : null,
        },
        0,
      ],
    },
    collapsible: {
      group: "block",
      content: "paragraph block*",
      defining: true,
      attrs: { ...blockId, open: { default: true } },
      parseDOM: [
        {
          tag: "div[data-collapsible]",
          getAttrs: (dom: HTMLElement | string) => ({
            ...idFromDom(dom),
            open: typeof dom !== "string" && dom.hasAttribute("data-open"),
          }),
        },
      ],
      toDOM: (node): DOMOutputSpec => [
        "div",
        {
          "data-block-id": blockIdOf(node),
          "data-collapsible": "",
          "data-open": node.attrs.open ? "" : null,
        },
        0,
      ],
    },
    text: { group: "inline" },
    activity: {
      group: "inline",
      inline: true,
      atom: true,
      selectable: true,
      attrs: { activityId: {} },
      leafText: () => "",
      parseDOM: [
        {
          tag: "span[data-activity-id]",
          getAttrs: (dom: HTMLElement | string) => {
            const activityId =
              typeof dom === "string"
                ? null
                : dom.getAttribute("data-activity-id")
            return activityId ? { activityId } : false
          },
        },
      ],
      toDOM: (node) => [
        "span",
        { "data-activity-id": node.attrs.activityId as string },
      ],
    },
    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },
  },
  marks: {
    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (dom: HTMLElement | string) => {
            const href =
              typeof dom === "string" ? null : dom.getAttribute("href")
            return href && isSafeHref(href) ? { href } : false
          },
        },
      ],
      toDOM: (mark) => [
        "a",
        {
          href: mark.attrs.href as string,
          title: mark.attrs.href as string,
          rel: "noopener noreferrer nofollow",
          class:
            "text-accent-text underline decoration-accent-text/40 underline-offset-2",
        },
        0,
      ],
    },
    strong: {
      parseDOM: [
        { tag: "strong" },
        { tag: "b" },
        { style: "font-weight=bold" },
      ],
      toDOM: () => ["strong", { class: "font-semibold" }, 0],
    },
    em: {
      parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
      toDOM: () => ["em", 0],
    },
    strike: {
      parseDOM: [{ tag: "s" }, { tag: "del" }],
      toDOM: () => ["s", 0],
    },
    code: {
      excludes: "_",
      parseDOM: [{ tag: "code" }],
      toDOM: () => [
        "code",
        {
          class:
            "rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em] text-accent-text",
        },
        0,
      ],
    },
  },
})

function headingClass(node: Node) {
  switch (node.attrs.level) {
    case 1:
      return "mt-6 mb-2 text-2xl leading-8 font-semibold tracking-tight"
    case 2:
      return "mt-5 mb-1.5 text-xl leading-7 font-semibold"
    default:
      return "mt-4 mb-1 text-lg leading-6 font-semibold"
  }
}

const nodes = schema.nodes
const marks = schema.marks

export { marks, nodes, schema }
