import { describe, expect, it } from "vitest"
import {
  isAllowed,
  resolveEffectivePermissions,
} from "#permissions"

describe("resolveEffectivePermissions", () => {
  it("lets members view but not update workspace settings", () => {
    const effective = resolveEffectivePermissions("member")
    expect(isAllowed({ workspaceSettings: ["view"] }, effective)).toBe(true)
    expect(isAllowed({ workspaceSettings: ["update"] }, effective)).toBe(false)
  })

  it("gives admins every app permission", () => {
    const effective = resolveEffectivePermissions("admin")
    expect(
      isAllowed({ workspaceSettings: ["view", "update"] }, effective)
    ).toBe(true)
  })

  it("ignores unknown roles", () => {
    expect(resolveEffectivePermissions("ghost")).toEqual({})
  })
})
