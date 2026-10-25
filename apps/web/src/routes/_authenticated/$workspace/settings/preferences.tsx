import { createFileRoute } from "@tanstack/react-router"
import {
  SettingsCard,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "./-components/SettingsPage"
import { ThemeSelect } from "./-components/ThemeSelect"

export const Route = createFileRoute(
  "/_authenticated/$workspace/settings/preferences"
)({
  component: PreferencesPage,
})

function PreferencesPage() {
  return (
    <SettingsPage title="Preferences">
      <SettingsSection title="Interface and theme">
        <SettingsCard>
          <SettingsRow
            label="Theme"
            htmlFor="theme"
            description="Choose how Knight OS looks on this account"
          >
            <ThemeSelect id="theme" />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  )
}
