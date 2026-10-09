type Props = {
  src: string;
};

export default function Image({ src }: Props) {
  return (
    <div className="flex items-center justify-center flex-grow m-1 w-full font-['Plus_Jakarta_Sans',sans-serif]">
      <img
        src={src}
        alt="bot_response_image"
        className="h-auto max-h-[500px] w-full object-contain rounded-xl border border-white/10 shadow-lg bg-[#11131c]"
      />
    </div>
  );
}