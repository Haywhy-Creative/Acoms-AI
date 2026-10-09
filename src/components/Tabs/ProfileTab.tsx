import { IonIcon } from "@ionic/react";
import Avatar from "../Avatar/Avatar";
import { pencilOutline, createOutline, checkmark } from "ionicons/icons";
import { useAuth } from "../../store/store";
import { useState } from "react";
import { motion } from "framer-motion";
import classNames from "classnames";
import { account, storage, ID, Permission, Role } from "../../appwriteConfig";

const variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export default function ProfileTab({ visible }: { visible: boolean }) {
  const [avatar, name, setUser] = useAuth((state) => [
    state.user.avatar,
    state.user.name,
    state.setUser,
  ]);
  const [editName, setEditName] = useState(false);
  const [myname, setMyName] = useState(name);
  const [loading, setLoading] = useState(false);

  // Handle Profile Picture Change & Save to Appwrite Storage Bucket
  async function handlePicChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      try {
        const uploadedFile = await storage.createFile(
          "6ac3940c002ffc7b4c55", 
          ID.unique(), 
          file,
          [
            Permission.read(Role.any()),    
            Permission.update(Role.users()), 
            Permission.delete(Role.users())  
          ]
        );

        const fileUrl = storage.getFileView(
          "6ac3940c002ffc7b4c55",
          uploadedFile.$id
        ).toString();

        await account.updatePrefs({ avatar: fileUrl });

        setUser({
          avatar: fileUrl,
          name,
          email: `${name}@${name}.com`,
        });

      } catch (error: any) {
        console.error("Failed to upload image:", error);
        alert(error.message || "Failed to upload image");
      }
    }
  }

  async function handleUpdateName() {
    if (myname.trim().length === 0) return;
    setLoading(true);

    try {
      await account.updateName(myname);
      setUser({
        avatar,
        name: myname,
        email: `${myname}@${myname}.com`,
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
      <div className="profile-pic group flex items-center justify-center relative mb-6">
        <input
          type="file"
          name="pic"
          accept="image/*"
          className="hidden"
          id="pic-file"
          onChange={handlePicChange}
        />
        <div className="relative rounded-full p-1 bg-slate-100 dark:bg-[#252936] border border-slate-200 dark:border-white/10 shadow-lg">
          <Avatar
            className="avatar h-24 w-24 rounded-full object-cover"
            src={avatar}
          >
            <button
              type="button"
              onClick={() => {
                const fileInput = document.getElementById(
                  "pic-file"
                ) as HTMLInputElement;
                fileInput.click();
              }}
              className="invisible absolute z-10 top-0 left-0 right-0 bottom-0 group-hover:visible transition-all duration-200 rounded-full bg-slate-900/60 dark:bg-[#0f111a]/70 backdrop-blur-xs flex items-center justify-center cursor-pointer"
              title="Change profile picture"
            >
              <IonIcon icon={pencilOutline} className="text-xl text-white" />
            </button>
          </Avatar>
        </div>
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