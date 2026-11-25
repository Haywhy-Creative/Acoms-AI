import { IonIcon } from "@ionic/react";
import Avatar from "../Avatar/Avatar";
import { pencilOutline, createOutline, checkmark } from "ionicons/icons";
import { useAuth } from "../../store/store";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import classNames from "classnames";
import { updateProfile } from "firebase/auth";
import { auth } from "../../config/firebase";
import { uploadUserAvatar } from "../../services/profileService";

const variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export default function ProfileTab({ visible }: { visible: boolean }) {
  const [avatar, name, email, userId, setUser] = useAuth((state) => [
    state.user.avatar,
    state.user.name,
    state.user.email,
    state.user.id,
    state.setUser,
  ]);
  const [editName, setEditName] = useState(false);
  const [myname, setMyName] = useState(name);
  const [loading, setLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The auth profile can hydrate after this tab mounts; keep the editor in sync
  // without overwriting text the user is currently typing.
  useEffect(() => {
    if (!editName) setMyName(name);
  }, [name, editName]);

  // Avatars are compressed in-browser and persisted to RTDB only.
  async function handlePicChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    setAvatarError("");

    try {
      const photoURL = await uploadUserAvatar(file);
      const authState = useAuth.getState();
      authState.setUser({ ...authState.user, avatar: photoURL });
    } catch (error: any) {
      console.error("Failed to upload image:", error);
      setAvatarError(error?.message || "Failed to upload image");
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = "";
    }
  }

  async function handleUpdateName() {
    if (myname.trim().length === 0) return;
    setLoading(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("You must be signed in to update your name.");
      await updateProfile(currentUser, { displayName: myname });
      setUser({
        id: userId,
        avatar,
        name: myname,
        email,
      });
      setEditName(false);
    } catch (error: any) {
      console.error("Failed to update name:", error);
      alert(error.message || "Failed to update name");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={classNames("p-4 font-['Plus_Jakarta_Sans',sans-serif] transition-colors duration-200", { hidden: !visible })}
    >
      <div className="profile-pic group flex flex-col items-center justify-center relative mb-6">
        <input
          type="file"
          name="pic"
          accept="image/png,image/jpeg,image/webp,image/gif"
          ref={fileInputRef}
          className="hidden"
          onChange={handlePicChange}
        />
        <div className="relative rounded-full p-1 bg-slate-100 dark:bg-[#252936] border border-slate-200 dark:border-white/10 shadow-lg">
          <Avatar
            className="avatar h-24 w-24 rounded-full object-cover"
            src={avatar}
          >
            <button
              type="button"
              disabled={isUploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
              className="invisible absolute z-10 top-0 left-0 right-0 bottom-0 group-hover:visible transition-all duration-200 rounded-full bg-slate-900/60 dark:bg-[#0f111a]/70 backdrop-blur-xs flex items-center justify-center cursor-pointer disabled:cursor-wait"
              title="Change profile picture"
            >
              <IonIcon icon={pencilOutline} className="text-xl text-white" />
            </button>
          </Avatar>
        </div>
        {isUploadingAvatar && (
          <p className="mt-2 text-xs font-medium text-[#7c4dff] dark:text-[#9670ff]">
            Uploading profile picture...
          </p>
        )}
        {!isUploadingAvatar && avatarError && (
          <p className="mt-2 text-xs text-red-500 dark:text-red-400" role="alert">
            {avatarError}
          </p>
        )}
      </div>

      <div className="text-center">
        {!editName && (
          <div className="flex items-center justify-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
            <span>{myname}</span>
            <button
              type="button"
              title="Edit name"
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer p-1 rounded-lg bg-slate-100 dark:bg-[#252936] border border-slate-200 dark:border-white/10 text-sm shadow-sm"
              onClick={() => setEditName(true)}
            >
              <IonIcon icon={createOutline} />
            </button>
          </div>
        )}
        {editName && (
          <div className="flex items-center justify-center gap-2 max-w-xs mx-auto">
            <input
              type="text"
              id="name"
              value={myname}
              onChange={(e) => setMyName(e.target.value)}
              className="bg-slate-50 dark:bg-[#161923] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-200 text-sm rounded-xl focus:ring-1 focus:ring-[#7c4dff] focus:border-[#7c4dff] block py-2.5 px-3 outline-none w-full"
              placeholder={myname}
              required
              autoFocus
            />
            <button
              type="button"
              className="flex items-center justify-center p-2.5 bg-[#7c4dff] hover:bg-[#6b3fd4] text-white rounded-xl transition-all shadow-md shadow-[#7c4dff]/20 cursor-pointer disabled:opacity-50"
              onClick={handleUpdateName}
              disabled={loading}
              title="Save name"
            >
              <IonIcon icon={checkmark} className="text-lg" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
