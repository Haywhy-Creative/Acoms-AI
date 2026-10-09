import { IonIcon } from "@ionic/react";
import useImage from "../../hooks/useImage";
import Avatar from "../Avatar/Avatar";
import Image from "../Image/Image";
import ImageSkeleton from "../Skeleton/ImageSkeleton";
import { downloadOutline, checkmarkOutline } from "ionicons/icons";
import { useState } from "react";
import { ChatMessageType } from "../../store/store";

type Props = {
  index: number;
  chat: ChatMessageType;
};

export default function ImageMessage({ index, chat }: Props) {
  const { loading, error, image } = useImage(index, chat);
  const [isImagesDownloaded, setIsImagesDownloaded] = useState(false);
  
  const handleDownload = async () => {
    setIsImagesDownloaded(true);
    // add download logic later
  };

  return (
    <div className="py-3 px-2 md:px-0 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="max-w-2xl mx-auto bg-white dark:bg-[#1c1f2b]/40 border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-md flex flex-col gap-3 group transition-colors duration-200">
        <div className="flex items-start w-full gap-3">
          <div className="rounded-xl flex items-center flex-shrink-0 bg-slate-100 dark:bg-[#252936] p-1 border border-slate-200 dark:border-white/10">
            <Avatar className="h-8 w-8" src="/imgs/logo.svg" />
          </div>

          <div className="flex-1 w-full overflow-hidden border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-[#161923]">
            {loading && (
              <div className="h-[300px] w-full p-2">
                <ImageSkeleton />
              </div>
            )}
            {error && (
              <div className="p-4 text-red-500 dark:text-red-400 text-xs">
                <p>{error}</p>
              </div>
            )}
            {!loading && !error && image && (
              <div className="flex items-center flex-wrap justify-center p-2">
                <Image src={image} key={image} />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end pt-2 border-t border-slate-200 dark:border-white/5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#252936] border border-slate-200 dark:border-white/10 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer shadow-sm"
            onClick={handleDownload}
            title="Download image"
          >
            {!isImagesDownloaded ? (
              <>
                <IonIcon icon={downloadOutline} className="text-base text-[#7c4dff] dark:text-[#9670ff]" />
                <span>Download</span>
              </>
            ) : (
              <>
                <IonIcon icon={checkmarkOutline} className="text-base text-teal-500 dark:text-teal-400" />
                <span className="text-teal-500 dark:text-teal-400">Downloaded</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}