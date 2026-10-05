import { IonIcon } from "@ionic/react";
import Avatar from "../Avatar/Avatar";
import { createOutline, pencilOutline, checkmark } from "ionicons/icons";
import { useAuth } from "../../store/store";
import { useState } from "react";
import { motion } from "framer-motion";
import classNames from "classnames";
import { account, storage, ID, Permission, Role } from "../../appwriteConfig"; // Added Permission and Role

const varinats = {
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
        // 1. Upload file to your 'profiles' Appwrite Storage Bucket with explicit permissions
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

        // 2. Get the public view URL for the uploaded file
        const fileUrl = storage.getFileView(
          "6ac3940c002ffc7b4c55",
          uploadedFile.$id
        ).toString();

        // 3. Save the URL into Appwrite Account Preferences so it persists across logouts
        await account.updatePrefs({ avatar: fileUrl });

        // 4. Update local global state immediately
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
      variants={varinats}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={classNames("p-2", { hidden: !visible })}
    >
      <div className="profile-pic group flex items-center justify-center relative">
        <input
          type="file"
          name="pic"
          accept="image/*"
          className=" hidden"
          id="pic-file"
          onChange={handlePicChange}
        />
        <Avatar
          className="avatar  h-20 w-20 ring-2 rounded-full object-cover ring-gray-300 p-1 dark:ring-gray-500"
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
            className="invisible absolute z-10 top-0 left-0 right-0 bottom-0 group-hover:visible  transition rounded-full  bg-gray-700 bg-opacity-50  flex items-center justify-center"
          >
            <IonIcon icon={pencilOutline} className="text-xl text-gray-100" />
          </button>
        </Avatar>
      </div>
      <div className="my-4 ">
        {!editName && (
          <div className="flex items-center justify-center text-xl">
            <span className="mr-2 ">{myname}</span>
            <button
              type="button"
              title="Edit name"
              className="flex items-center"
              onClick={() => setEditName(true)}
            >
              <IonIcon icon={createOutline} className=" dark:text-gray-100" />
            </button>
          </div>
        )}
        {editName && (
          <div className="flex items-center justify-center">
            <input
              type="text"
              id="name"
              value={myname}
              onChange={(e) => setMyName(e.target.value)}
              className="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg focus:ring-blue-500 focus:border-blue-500 block  py-2.5 px-1.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              placeholder={myname}
              required
            />
            <button
              type="button"
              className="flex items-center ml-2 text-xl"
              onClick={handleUpdateName}
              disabled={loading}
            >
              <IonIcon icon={checkmark} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}