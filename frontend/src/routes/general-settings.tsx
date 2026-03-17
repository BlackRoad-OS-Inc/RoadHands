import { SdkSectionPage } from "#/components/features/settings/sdk-settings/sdk-section-page";

function GeneralSettingsScreen() {
  return (
    <SdkSectionPage
      sectionKeys={["general"]}
      testId="general-settings-screen"
    />
  );
}

export default GeneralSettingsScreen;
