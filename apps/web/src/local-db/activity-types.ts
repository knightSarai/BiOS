import { now, parseUtc } from "@knight-os/server/core"
import {
  cleanStatusNames,
  type StatusNames,
  type TypeColor,
} from "@/activities/activity-types"
import type { ActivityStatus } from "@/activities/status"
import {
  keepValidValues,
  kindHasOptions,
  type FieldKind,
  type FieldOption,
} from "@/activities/fields"
import { compareSortKeys, keyBetween } from "@/notebook/sort-keys"
import type { ActivityTypeFieldRow, ActivityTypeRow, LocalDb } from "./db"

type ActivityTypesContext = {
  workspaceId: string
}

type NewActivityType = {
  name: string
  color: TypeColor
}

type ActivityTypeChanges = {
  name?: string
  color?: TypeColor
  icon?: string | null
  statusNames?: StatusNames
}

type NewField = {
  name: string
  kind: FieldKind
  options?: string[]
}

type OptionInput = { id?: string; label: string }

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

  async fields(typeId: string) {
    const rows = await this.db.activityTypeFields
      .where("[workspaceId+typeId]")
      .equals([this.ctx.workspaceId, typeId])
      .toArray()
    return rows.sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
  }

  private async fieldById(id: string) {
    const row = await this.db.activityTypeFields.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  async create(type: NewActivityType) {
    const timestamp = parseUtc(now())
    const row: ActivityTypeRow = {
      id: crypto.randomUUID(),
      workspaceId: this.ctx.workspaceId,
      name: requireName(type.name, "type"),
      color: type.color,
      icon: null,
      statusNames: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.db.activityTypes.add(row)
    return row
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
      updatedAt: parseUtc(now()),
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

  addField(typeId: string, field: NewField) {
    return this.db.transaction(
      "rw",
      this.db.activityTypes,
      this.db.activityTypeFields,
      async () => {
        if (!(await this.byId(typeId))) {
          throw new Error("The type for this field does not exist.")
        }
        const existing = await this.fields(typeId)
        const timestamp = parseUtc(now())
        const row: ActivityTypeFieldRow = {
          id: crypto.randomUUID(),
          workspaceId: this.ctx.workspaceId,
          typeId,
          name: requireName(field.name, "field"),
          kind: field.kind,
          options: kindHasOptions(field.kind)
            ? toOptions((field.options ?? []).map((label) => ({ label })))
            : [],
          sortKey: keyBetween(existing.at(-1)?.sortKey ?? null, null),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await this.db.activityTypeFields.add(row)
        return row
      }
    )
  }

  async renameField(fieldId: string, name: string) {
    const field = await this.fieldById(fieldId)
    if (!field) return
    await this.db.activityTypeFields.update(fieldId, {
      name: requireName(name, "field"),
      updatedAt: parseUtc(now()),
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
      this.db.activityTypeFields,
      this.db.activities,
      async () => {
        const field = await this.fieldById(fieldId)
        if (!field) return
        if (!kindHasOptions(field.kind)) {
          throw new Error("Only choice fields have options.")
        }
        await this.db.activityTypeFields.update(fieldId, {
          options: toOptions(change(field.options)),
          updatedAt: parseUtc(now()),
        })
        await this.revalidateValues(field.typeId)
      }
    )
  }

  removeField(fieldId: string) {
    return this.db.transaction(
      "rw",
      this.db.activityTypeFields,
      this.db.activities,
      async () => {
        const field = await this.fieldById(fieldId)
        if (!field) return
        await this.db.activityTypeFields.delete(fieldId)
        await this.revalidateValues(field.typeId)
      }
    )
  }

  async activityCount(typeId: string) {
    return this.db.activities
      .where("typeId")
      .equals(typeId)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
      .count()
  }

  delete(typeId: string) {
    return this.db.transaction(
      "rw",
      [this.db.activityTypes, this.db.activityTypeFields, this.db.activities],
      async () => {
        if (!(await this.byId(typeId))) return
        const timestamp = parseUtc(now())
        await this.db.activities
          .where("typeId")
          .equals(typeId)
          .filter((row) => row.workspaceId === this.ctx.workspaceId)
          .modify({ typeId: null, fields: {}, updatedAt: timestamp })
        await this.db.activityTypeFields
          .where("[workspaceId+typeId]")
          .equals([this.ctx.workspaceId, typeId])
          .delete()
        await this.db.activityTypes.delete(typeId)
      }
    )
  }

  private async revalidateValues(typeId: string) {
    const fields = await this.fields(typeId)
    await this.db.activities
      .where("typeId")
      .equals(typeId)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
      .modify((row) => {
        row.fields = keepValidValues(fields, row.fields)
      })
  }
}

export { ActivityTypesRepository }
export type {
  ActivityTypeChanges,
  ActivityTypesContext,
  NewActivityType,
  NewField,
}
