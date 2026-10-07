import { IonIcon } from "@ionic/react";
import { sparkles } from "ionicons/icons";
import { useSettings } from "../../store/store";
import classNames from "classnames";

export default function GptIntro() {
  const [selectedModel, setModel] = useSettings((state) => [
    state.settings.selectedModal,
    state.setModal,
  ]);
  const isGptThreeSelected = selectedModel.startsWith("gpt-3");
  return (
    <>
      
<div className="w-full pt-6 pb-2 flex flex-col items-center justify-start space-y-3">
  <div className="flex items-center space-x-3 bg-gray-800/60 border border-gray-700/60 px-5 py-2 rounded-full shadow-inner">
    <span className="text-teal-400 text-xl flex items-center">
      <IonIcon icon={sparkles} />
    </span>
    <h1 className="text-2xl font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">
      ACOMS-AI
    </h1>
  </div>
</div>
    </>
  );
}
