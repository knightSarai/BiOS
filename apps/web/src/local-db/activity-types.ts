import { now, parseUtc } from "@knight-os/server/core"
import {
  cleanStatusNames,
  type StatusNames,
  type TypeColor,
} from "@/activities/activity-types"
import type { ActivityStatus } from "@/activities/status"
import { parseTimerConfig, type TimerConfig } from "@/activities/timer"
import {
  kindHasOptions,
  revalidateValue,
  withoutValue,
  type FieldKind,
  type FieldOption,
} from "@/activities/fields"
import {
  checkTypeParent,
  resolveTypeFields,
  subtypeIds,
} from "@/activities/type-tree"
import { compareSortKeys, keyBetween } from "@/notebook/sort-keys"
import type {
  ActivityFieldRow,
  ActivityTypeFieldRow,
  ActivityTypeRow,
  LocalDb,
} from "./db"

type ActivityTypesContext = {
  workspaceId: string
}

type NewActivityType = {
  name: string
  color: TypeColor
  parentId?: string | null
  icon?: string | null
}

type ActivityTypeChanges = {
  name?: string
  color?: TypeColor
  icon?: string | null
  statusNames?: StatusNames
  timer?: TimerConfig | null
}

type NewField = {
  name: string
  kind: FieldKind
  options?: string[]
}

type OptionInput = { id?: string; label: string }

class TypeHasSubtypesError extends Error {}

const requireName = (name: string, what: string) => {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(`A ${what} needs a name.`)
  return trimmed
}

const toOptions = (options: OptionInput[]): FieldOption[] =>
  options.reduce<FieldOption[]>((result, option) => {
    const id = option.id ?? crypto.randomUUID()
    const label = option.label.trim()
    return label === "" || result.some((kept) => kept.id === id)
      ? result
      : [...result, { id, label }]
  }, [])

const byFieldName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "accent" })

class ActivityTypesRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: ActivityTypesContext
  ) {}

  async list() {
    const rows = await this.db.activityTypes
      .where("workspaceId")
      .equals(this.ctx.workspaceId)
      .toArray()
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async byId(id: string) {
    const row = await this.db.activityTypes.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  // Inherited fields first, root type down, then the type's own.
  async fields(typeId: string) {
    const [types, links, fields] = await Promise.all([
      this.list(),
      this.typeFieldLinks(),
      this.library(),
    ])
    return resolveTypeFields(types, links, fields, typeId)
  }

  async library() {
    const rows = await this.db.activityFields
      .where("workspaceId")
      .equals(this.ctx.workspaceId)
      .toArray()
    return rows.sort(byFieldName)
  }

  async fieldById(id: string) {
    const row = await this.db.activityFields.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  async fieldsByIds(ids: string[]) {
    const rows = await this.db.activityFields.bulkGet(ids)
    return rows.filter(
      (row): row is ActivityFieldRow =>
        row?.workspaceId === this.ctx.workspaceId
    )
  }

  typeFieldLinks() {
    return this.db.activityTypeFields
      .where("[workspaceId+typeId]")
      .between([this.ctx.workspaceId, ""], [this.ctx.workspaceId, "￿"])
      .toArray()
  }

  typeLinks(typeId: string) {
    return this.db.activityTypeFields
      .where("[workspaceId+typeId]")
      .equals([this.ctx.workspaceId, typeId])
      .toArray()
  }

  async fieldUsage() {
    const usage = new Map<string, { typeIds: string[]; valueCount: number }>()
    const entry = (fieldId: string) => {
      const found = usage.get(fieldId) ?? { typeIds: [], valueCount: 0 }
      usage.set(fieldId, found)
      return found
    }
    for (const link of await this.typeFieldLinks())
      entry(link.fieldId).typeIds.push(link.typeId)
    await this.db.activities
      .where("workspaceId")
      .equals(this.ctx.workspaceId)
      .each((row) => {
        for (const fieldId of Object.keys(row.fields))
          entry(fieldId).valueCount++
      })
    return usage
  }

  async optionValueCount(fieldId: string, optionId: string) {
    return this.db.activities
      .where("workspaceId")
      .equals(this.ctx.workspaceId)
      .filter((row) => {
        const value = row.fields[fieldId]
        return Array.isArray(value)
          ? value.includes(optionId)
          : value === optionId
      })
      .count()
  }

  create(type: NewActivityType) {
    return this.db.transaction("rw", this.db.activityTypes, async () => {
      const parentId = type.parentId ?? null
      const timestamp = parseUtc(now())
      const row: ActivityTypeRow = {
        id: crypto.randomUUID(),
        workspaceId: this.ctx.workspaceId,
        parentId,
        name: requireName(type.name, "type"),
        color: type.color,
        icon: type.icon ?? null,
        statusNames: {},
        timer: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      checkTypeParent([...(await this.list()), row], row.id, parentId)
      await this.db.activityTypes.add(row)
      return row
    })
  }

  async update(id: string, changes: ActivityTypeChanges) {
    const type = await this.byId(id)
    if (!type) return
    await this.db.activityTypes.update(id, {
      ...(changes.name === undefined
        ? {}
        : { name: requireName(changes.name, "type") }),
      ...(changes.color === undefined ? {} : { color: changes.color }),
      ...(changes.icon === undefined ? {} : { icon: changes.icon }),
      ...(changes.statusNames === undefined
        ? {}
        : { statusNames: cleanStatusNames(changes.statusNames) }),
      ...(changes.timer === undefined
        ? {}
        : {
            timer:
              changes.timer === null ? null : parseTimerConfig(changes.timer),
          }),
      updatedAt: parseUtc(now()),
    })
  }

  setParent(id: string, parentId: string | null) {
    return this.db.transaction("rw", this.db.activityTypes, async () => {
      if (!(await this.byId(id))) return
      checkTypeParent(await this.list(), id, parentId)
      await this.db.activityTypes.update(id, {
        parentId,
        updatedAt: parseUtc(now()),
      })
    })
  }

  // Reads the stored names inside the transaction, so quick renames in a row don't overwrite each other.
  renameStatus(id: string, status: ActivityStatus, name: string) {
    return this.db.transaction("rw", this.db.activityTypes, async () => {
      const type = await this.byId(id)
      if (!type) return
      await this.db.activityTypes.update(id, {
        statusNames: cleanStatusNames({ ...type.statusNames, [status]: name }),
        updatedAt: parseUtc(now()),
      })
    })
  }

  private async requireFreeName(name: string, fieldId: string | null) {
    const taken = (await this.library()).find(
      (row) => row.id !== fieldId && byFieldName(row, { name }) === 0
    )
    if (taken) {
      throw new Error(`There is already a field called ${taken.name}.`)
    }
  }

  createField(field: NewField) {
    return this.db.transaction("rw", this.db.activityFields, async () => {
      const name = requireName(field.name, "field")
      await this.requireFreeName(name, null)
      const timestamp = parseUtc(now())
      const row: ActivityFieldRow = {
        id: crypto.randomUUID(),
        workspaceId: this.ctx.workspaceId,
        name,
        kind: field.kind,
        options: kindHasOptions(field.kind)
          ? toOptions((field.options ?? []).map((label) => ({ label })))
          : [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.db.activityFields.add(row)
      return row
    })
  }

  addField(typeId: string, field: NewField) {
    return this.db.transaction(
      "rw",
      [
        this.db.activityTypes,
        this.db.activityFields,
        this.db.activityTypeFields,
      ],
      async () => {
        if (!(await this.byId(typeId))) {
          throw new Error("The type for this field does not exist.")
        }
        const row = await this.createField(field)
        await this.linkField(typeId, row.id)
        return row
      }
    )
  }

  linkField(typeId: string, fieldId: string) {
    return this.db.transaction(
      "rw",
      [
        this.db.activityTypes,
        this.db.activityFields,
        this.db.activityTypeFields,
      ],
      async () => {
        if (!(await this.byId(typeId))) {
          throw new Error("The type for this field does not exist.")
        }
        if (!(await this.fieldById(fieldId))) {
          throw new Error("That field does not exist.")
        }
        if ((await this.fields(typeId)).some((field) => field.id === fieldId)) {
          return
        }
        const own = await this.typeLinks(typeId)
        const last =
          own
            .map((link) => link.sortKey)
            .sort(compareSortKeys)
            .at(-1) ?? null
        const row: ActivityTypeFieldRow = {
          id: crypto.randomUUID(),
          workspaceId: this.ctx.workspaceId,
          typeId,
          fieldId,
          sortKey: keyBetween(last, null),
          createdAt: parseUtc(now()),
        }
        await this.db.activityTypeFields.add(row)
      }
    )
  }

  // Activities keep their values; the field just stops showing for the type.
  async unlinkField(typeId: string, fieldId: string) {
    await this.db.activityTypeFields
      .where("[workspaceId+typeId+fieldId]")
      .equals([this.ctx.workspaceId, typeId, fieldId])
      .delete()
  }

  renameField(fieldId: string, name: string) {
    return this.db.transaction("rw", this.db.activityFields, async () => {
      if (!(await this.fieldById(fieldId))) return
      const trimmed = requireName(name, "field")
      await this.requireFreeName(trimmed, fieldId)
      await this.db.activityFields.update(fieldId, {
        name: trimmed,
        updatedAt: parseUtc(now()),
      })
    })
  }

  setFieldOptions(fieldId: string, options: OptionInput[]) {
    return this.changeOptions(fieldId, () => options)
  }

  addOption(fieldId: string, label: string) {
    return this.changeOptions(fieldId, (options) => [...options, { label }])
  }

  renameOption(fieldId: string, optionId: string, label: string) {
    return this.changeOptions(fieldId, (options) =>
      options.map((option) =>
        option.id === optionId ? { ...option, label } : option
      )
    )
  }

  removeOption(fieldId: string, optionId: string) {
    return this.changeOptions(fieldId, (options) =>
      options.filter((option) => option.id !== optionId)
    )
  }

  // Reads the stored options inside the transaction, so quick edits in a row don't overwrite each other.
  private changeOptions(
    fieldId: string,
    change: (options: FieldOption[]) => OptionInput[]
  ) {
    return this.db.transaction(
      "rw",
      this.db.activityFields,
      this.db.activities,
      async () => {
        const field = await this.fieldById(fieldId)
        if (!field) return
        if (!kindHasOptions(field.kind)) {
          throw new Error("Only choice fields have options.")
        }
        const changed = { ...field, options: toOptions(change(field.options)) }
        await this.db.activityFields.update(fieldId, {
          options: changed.options,
          updatedAt: parseUtc(now()),
        })
        await this.activitiesWithValue(fieldId).modify((row) => {
          row.fields = revalidateValue(changed, row.fields)
        })
      }
    )
  }

  // The only way values go: the field is gone from every type and every activity.
  deleteField(fieldId: string) {
    return this.db.transaction(
      "rw",
      [this.db.activityFields, this.db.activityTypeFields, this.db.activities],
      async () => {
        if (!(await this.fieldById(fieldId))) return
        await this.db.activityTypeFields
          .where("[workspaceId+fieldId]")
          .equals([this.ctx.workspaceId, fieldId])
          .delete()
        await this.activitiesWithValue(fieldId).modify((row) => {
          row.fields = withoutValue(row.fields, fieldId)
        })
        await this.db.activityFields.delete(fieldId)
      }
    )
  }

  private activitiesWithValue(fieldId: string) {
    return this.db.activities
      .where("workspaceId")
      .equals(this.ctx.workspaceId)
      .filter((row) => fieldId in row.fields)
  }

  async activityCount(typeId: string) {
    return this.db.activities
      .where("typeId")
      .equals(typeId)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
      .count()
  }

  // Its activities keep their values and lose only the type.
  delete(typeId: string) {
    return this.db.transaction(
      "rw",
      [this.db.activityTypes, this.db.activityTypeFields, this.db.activities],
      async () => {
        const type = await this.byId(typeId)
        if (!type) return
        if (subtypeIds(await this.list(), typeId).length > 0) {
          throw new TypeHasSubtypesError(
            `Move or delete the subtypes of ${type.name} first.`
          )
        }
        await this.db.activities
          .where("typeId")
          .equals(typeId)
          .filter((row) => row.workspaceId === this.ctx.workspaceId)
          .modify({ typeId: null, updatedAt: parseUtc(now()) })
        await this.db.activityTypeFields
          .where("[workspaceId+typeId]")
          .equals([this.ctx.workspaceId, typeId])
          .delete()
        await this.db.activityTypes.delete(typeId)
      }
    )
  }
}

export { ActivityTypesRepository, TypeHasSubtypesError, byFieldName }
export type {
  ActivityTypeChanges,
  ActivityTypesContext,
  NewActivityType,
  NewField,
}
