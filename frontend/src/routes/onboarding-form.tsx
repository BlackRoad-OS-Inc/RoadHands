import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, redirect } from "react-router";
import StepHeader from "#/components/features/onboarding/step-header";
import { StepContent } from "#/components/features/onboarding/step-content";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import OpenHandsLogoWhite from "#/assets/branding/openhands-logo-white.svg?react";
import { useSubmitOnboarding } from "#/hooks/mutation/use-submit-onboarding";
import { useTracking } from "#/hooks/use-tracking";
import { ENABLE_ONBOARDING } from "#/utils/feature-flags";
import { cn } from "#/utils/utils";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { useConfig } from "#/hooks/query/use-config";
import { ONBOARDING_FORM } from "#/constants/onboarding";

export const clientLoader = async () => {
  if (!ENABLE_ONBOARDING()) {
    return redirect("/");
  }

  return null;
};

function OnboardingForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = useConfig();
  const { mutate: submitOnboarding } = useSubmitOnboarding();
  const { trackOnboardingCompleted } = useTracking();

  const appMode = config.data?.app_mode ?? "oss";

  const steps = React.useMemo(
    () =>
      ONBOARDING_FORM.filter((step) =>
        step.app_mode.includes(appMode as "oss" | "saas"),
      ),
    [appMode],
  );

  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [selections, setSelections] = React.useState<
    Record<string, string | string[]>
  >({});
  const [inputValues, setInputValues] = React.useState<Record<string, string>>(
    {},
  );

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;

  const currentSelections = React.useMemo(() => {
    if (!currentStep) return [];
    const selection = selections[currentStep.id];
    if (!selection) return [];
    return Array.isArray(selection) ? selection : [selection];
  }, [selections, currentStep]);

  const isStepComplete = React.useMemo(() => {
    if (!currentStep) return false;

    if (currentStep.type === "input") {
      return currentStep.inputOptions!.every((field) =>
        inputValues[field.id]?.trim(),
      );
    }
    return currentSelections.length > 0;
  }, [currentStep, inputValues, currentSelections]);

  const handleSelectOption = (optionId: string) => {
    if (!currentStep) return;

    if (currentStep.type === "multi") {
      setSelections((prev) => {
        const current = prev[currentStep.id];
        const currentArray = Array.isArray(current) ? current : [];

        if (currentArray.includes(optionId)) {
          return {
            ...prev,
            [currentStep.id]: currentArray.filter((id) => id !== optionId),
          };
        }
        return {
          ...prev,
          [currentStep.id]: [...currentArray, optionId],
        };
      });
    } else {
      setSelections((prev) => ({
        ...prev,
        [currentStep.id]: optionId,
      }));
    }
  };

  const handleInputChange = (fieldId: string, value: string) => {
    setInputValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const handleNext = () => {
    if (isLastStep) {
      const allSelections = { ...selections, ...inputValues };
      submitOnboarding({ selections: allSelections });

      // Only track onboarding for SaaS users
      if (appMode === "saas") {
        try {
          trackOnboardingCompleted({
            role: selections.role as string | undefined,
            orgSize: selections.org_size as string | undefined,
            useCase: selections.use_case as string[] | undefined,
          });
        } catch (error) {
          console.error("Failed to track onboarding:", error);
        }
      }
    } else {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (isFirstStep) {
      navigate(-1);
    } else {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  if (!currentStep) {
    return null;
  }

  const translatedOptions = currentStep.answerOptions?.map((option) => ({
    id: option.id,
    label: t(option.key),
  }));

  const translatedInputFields = currentStep.inputOptions?.map((field) => ({
    id: field.id,
    label: t(field.key),
  }));

  return (
    <ModalBackdrop>
      <div
        data-testid="onboarding-form"
        className="w-[500px] max-w-[calc(100vw-2rem)] mx-auto p-4 sm:p-6 flex flex-col justify-center overflow-hidden"
      >
        <div className="flex flex-col items-center mb-4">
          <OpenHandsLogoWhite width={55} height={55} />
        </div>
        <StepHeader
          title={t(currentStep.questionKey)}
          subtitle={
            currentStep.subtitleKey ? t(currentStep.subtitleKey) : undefined
          }
          currentStep={currentStepIndex + 1}
          totalSteps={steps.length}
        />
        <StepContent
          options={translatedOptions}
          inputFields={translatedInputFields}
          selectedOptionIds={currentSelections}
          inputValues={inputValues}
          onSelectOption={handleSelectOption}
          onInputChange={handleInputChange}
        />
        <div
          data-testid="step-actions"
          className="flex justify-end items-center gap-3"
        >
          {!isFirstStep && (
            <BrandButton
              type="button"
              variant="secondary"
              onClick={handleBack}
              className="flex-1 px-4 sm:px-6 py-2.5 bg-[050505] text-white border hover:bg-white border-[#242424] hover:text-black"
            >
              {t(I18nKey.ONBOARDING$BACK_BUTTON)}
            </BrandButton>
          )}
          <BrandButton
            type="button"
            variant="primary"
            onClick={handleNext}
            isDisabled={!isStepComplete}
            className={cn(
              "px-4 sm:px-6 py-2.5 bg-white text-black hover:bg-white/90",
              isFirstStep ? "w-1/2" : "flex-1",
            )}
          >
            {t(
              isLastStep
                ? I18nKey.ONBOARDING$FINISH_BUTTON
                : I18nKey.ONBOARDING$NEXT_BUTTON,
            )}
          </BrandButton>
        </div>
      </div>
    </ModalBackdrop>
  );
}

export default OnboardingForm;
