import { useConfig } from "#/hooks/query/use-config";
import { useMe } from "#/hooks/query/use-me";
import { useOrgTypeAndAccess } from "#/hooks/use-org-type-and-access";
import { SAAS_NAV_ITEMS, OSS_NAV_ITEMS } from "#/constants/settings-nav";

export function useSettingsNavItems() {
  const { data: config } = useConfig();
  const { data: me } = useMe();
  const { isPersonalOrg, isTeamOrg, organizationId } = useOrgTypeAndAccess();

  const shouldHideLlmSettings = !!config?.feature_flags?.hide_llm_settings;
  const shouldHideBilling = !config?.feature_flags?.enable_billing;
  const isSaasMode = config?.app_mode === "saas";
  const isMember = me?.role === "member";

  let items = isSaasMode ? SAAS_NAV_ITEMS : OSS_NAV_ITEMS;

  if (shouldHideLlmSettings) {
    items = items.filter((item) => item.to !== "/settings");
  }

  // Hide billing for team orgs or when enable_billing flag is set
  if (shouldHideBilling || isTeamOrg) {
    items = items.filter((item) => item.to !== "/settings/billing");
  }

  // Hide org routes for personal orgs, member role, or no org selected
  if (isPersonalOrg || isMember || !organizationId) {
    items = items.filter(
      (item) =>
        item.to !== "/settings/org" && item.to !== "/settings/org-members",
    );
  }

  return items;
}
