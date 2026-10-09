import SyntaxHighlighter from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism";
import { IonIcon } from "@ionic/react";
import { clipboardOutline, checkmarkOutline } from "ionicons/icons";
import useClipboard from "../../hooks/useClipboard";

type Props = {
  children: string;
  language: string;
};

export default function CodeHighlight({ children, language }: Props) {
  const { copy, copied } = useClipboard();

  return (
    <div className="mycode relative my-4 rounded-2xl overflow-hidden border border-white/10 bg-[#161923] shadow-xl font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1c1f2b] border-b border-white/10 text-xs text-slate-400 font-semibold uppercase tracking-wider">
        <span>{language || "code"}</span>
        <button
          type="button"
          className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs"
          onClick={() => copy(children)}
          title="Copy code"
        >
          {!copied ? (
            <>
              <IonIcon icon={clipboardOutline} className="text-base text-[#9670ff]" />
              <span>Copy code</span>
            </>
          ) : (
            <>
              <IonIcon icon={checkmarkOutline} className="text-base text-teal-400" />
              <span className="text-teal-400">Copied!</span>
            </>
          )}
        </button>
      </div>

      <SyntaxHighlighter
        PreTag="div"
        language={language}
        style={dracula}
        customStyle={{
          margin: 0,
          padding: "1.25rem",
          background: "#161923",
          fontSize: "0.875rem",
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}