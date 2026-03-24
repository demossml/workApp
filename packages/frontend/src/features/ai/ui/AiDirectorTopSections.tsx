import type { AiDirectorPageModel } from "@features/ai/hooks/useAiDirectorPageModel";
import { AiDirectorTopWidget } from "@widgets/ai-director";

type Props = {
  model: AiDirectorPageModel;
};

export function AiDirectorTopSections({ model }: Props) {
  return <AiDirectorTopWidget model={model} />;
}
