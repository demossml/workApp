import type { AiDirectorPageModel } from "@features/ai/hooks/useAiDirectorPageModel";
import { AiDirectorDataWidget } from "@widgets/ai-director";

type Props = {
  model: AiDirectorPageModel;
};

export function AiDirectorDataSections({ model }: Props) {
  return <AiDirectorDataWidget model={model} />;
}
