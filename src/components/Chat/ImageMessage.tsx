import { IonIcon } from "@ionic/react";
import useImage from "../../hooks/useImage";
import Avatar from "../Avatar/Avatar";
import ImageSkeleton from "../Skeleton/ImageSkeleton";
import { downloadOutline, checkmarkOutline, refreshOutline } from "ionicons/icons";
import { useEffect, useRef, useState } from "react";
import { ChatMessageType } from "../../store/store";

type Props = {
  index: number;
  chat: ChatMessageType;
};

export default function ImageMessage({ index, chat }: Props) {
  const { loading: hookLoading, error: hookError, image, refetchImages } = useImage(index, chat);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isImagesDownloaded, setIsImagesDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trust only the validated generated payload from useImage. Legacy strings
  // such as /imgs/bot.webp must never be presented as a generated result.
  const displayImage = image || "";

  // Reset per-image view state when a new URL replaces the old one.
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [displayImage]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  function markDownloaded() {
    setIsImagesDownloaded(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsImagesDownloaded(false), 3000);
  }

  // 📥 Robust Blob Download Handler with CORS Fallback
  const handleDownload = async () => {
    if (!displayImage || isDownloading) return;
    setIsDownloading(true);

    try {
      // Attempt clean blob download
      const response = await fetch(displayImage, { mode: "cors" });
      if (!response.ok) throw new Error("Network response was not ok");

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `acoms-ai-image-${Date.now()}.${/data:image\/png/i.test(displayImage) ? "png" : "jpg"}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Revoke only after the browser has started the download.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);

      markDownloaded();
    } catch (err) {
      console.warn("CORS restricted direct blob download, using direct anchor download fallback:", err);

      // Fallback: Direct forced download via anchor tag
      try {
        const link = document.createElement("a");
        link.href = displayImage;
        link.target = "_blank";
        link.download = `acoms-ai-image-${Date.now()}.${/data:image\/png/i.test(displayImage) ? "png" : "jpg"}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        markDownloaded();
      } catch (fallbackErr) {
        console.error("All download methods failed, opening in new tab:", fallbackErr);
        window.open(displayImage, "_blank");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="py-3 px-2 md:px-0 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="max-w-2xl mx-auto bg-white dark:bg-[#1c1f2b]/40 border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-md flex flex-col gap-3 group transition-colors duration-200">
        <div className="flex items-start w-full gap-3">
          <div className="rounded-xl flex items-center flex-shrink-0 bg-slate-100 dark:bg-[#252936] p-1 border border-slate-200 dark:border-white/10">
            <Avatar className="h-8 w-8" src="/imgs/logo.svg" />
          </div>

          <div className="flex-1 w-full overflow-hidden border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-[#161923] relative min-h-[250px] flex items-center justify-center">
            {/* Show skeleton while hook or image element is loading */}
            {displayImage && (hookLoading || (!imageLoaded && !imageError)) && (
              <div className="absolute inset-0 w-full h-full p-2 z-10 bg-slate-50 dark:bg-[#161923]">
                <ImageSkeleton />
              </div>
            )}

            {!displayImage && !hookLoading && !hookError && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No image available for this message.
              </p>
            )}

            {/* Error state if fetch or load fails */}
            {(hookError || imageError) && (
              <div className="p-4 text-red-500 dark:text-red-400 text-xs flex flex-col items-center gap-2 z-20">
                <p>{hookError || "Failed to load generated artwork."}</p>
                <button
                  type="button"
                  onClick={() => {
                    setImageError(false);
                    setImageLoaded(false);
                    refetchImages(); // 🔄 Triggers a fresh node fetch via useImage
                  }}
                  className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-lg transition-colors text-red-500 cursor-pointer"
                >
                  <IonIcon icon={refreshOutline} /> Retry Loading
                </button>
              </div>
            )}

            {/* Render actual image directly */}
            {displayImage && (
              <div className="w-full overflow-hidden scale-[1.02] origin-top transition-transform duration-300 flex items-center justify-center">
                <img
                  src={displayImage}
                  alt="AI Generated Artwork"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                  className={`w-full h-auto object-cover transition-opacity duration-300 ${
                    imageLoaded ? "opacity-100" : "opacity-0"
                  }`}
                />
              </div>
            )}
          </div>
        </div>

        {/* Bottom Toolbar */}
        <div className="flex items-center justify-end pt-2 border-t border-slate-200 dark:border-white/5">
          <button
            type="button"
            disabled={isDownloading || !displayImage || !imageLoaded}
            className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#252936] border border-slate-200 dark:border-white/10 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            onClick={handleDownload}
            title="Download image"
          >
            {isDownloading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-[#7c4dff] border-t-transparent rounded-full animate-spin"></span>
                Downloading...
              </span>
            ) : !isImagesDownloaded ? (
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