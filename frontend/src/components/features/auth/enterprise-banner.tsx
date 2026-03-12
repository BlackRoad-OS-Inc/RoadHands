import { useTranslation } from "react-i18next";
import { usePostHog } from "posthog-js/react";
import { I18nKey } from "#/i18n/declaration";
import ServerIcon from "#/icons/server.svg?react";

const ENTERPRISE_URL = "https://openhands.dev/enterprise";

export function EnterpriseBanner() {
  const { t } = useTranslation();
  const posthog = usePostHog();

  const handleLearnMoreClick = () => {
    posthog.capture("saas_selfhosted_inquiry");
    window.open(ENTERPRISE_URL, "_blank", "noopener,noreferrer");
  };

  const features = [
    t(I18nKey.ENTERPRISE$FEATURE_ON_PREMISES),
    t(I18nKey.ENTERPRISE$FEATURE_DATA_CONTROL),
    t(I18nKey.ENTERPRISE$FEATURE_COMPLIANCE),
    t(I18nKey.ENTERPRISE$FEATURE_SUPPORT),
  ];

  return (
    <div
      className="flex flex-col gap-4 p-6 rounded-xl border border-neutral-600 bg-base-secondary w-[280px]"
      data-testid="enterprise-banner"
    >
      <ServerIcon className="w-8 h-8 text-neutral-400" />

      <h2 className="text-lg font-semibold text-white">
        {t(I18nKey.ENTERPRISE$TITLE)}
      </h2>

      <p className="text-sm text-neutral-400">
        {t(I18nKey.ENTERPRISE$DESCRIPTION)}
      </p>

      <ul className="flex flex-col gap-2 text-sm text-neutral-400">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span>•</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={handleLearnMoreClick}
        className="mt-2 px-4 py-2 bg-tertiary border border-neutral-600 rounded text-sm text-white hover:bg-neutral-500 transition-colors w-fit"
      >
        {t(I18nKey.ENTERPRISE$LEARN_MORE)}
      </button>
    </div>
  );
}
