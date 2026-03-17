import { SdkSectionPage } from "#/components/features/settings/sdk-settings/sdk-section-page";

function SecuritySettingsScreen() {
  return (
    <SdkSectionPage
      sectionKeys={["security"]}
      testId="security-settings-screen"
    />
  );
}

export default SecuritySettingsScreen;
