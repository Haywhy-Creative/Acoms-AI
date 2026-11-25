import classNames from "classnames";
import { useAuth } from "../../store/store";
import { DEFAULT_AVATAR } from "../../services/profileService";

type Props = {
  children?: React.ReactNode;
  src?: string;
  className?: string;
};

export default function Avatar({ src, children, className }: Props) {
  const imgClass = classNames(`rounded`, className);
  const avatar = useAuth((state) => state.user.avatar);
  const imageSrc = src || avatar || DEFAULT_AVATAR;

  return (
    <div className={classNames(`avatar rounded relative`)}>
      <img
        src={imageSrc}
        alt="avatar"
        className={imgClass}
        onError={(event) => {
          const element = event.currentTarget;
          if (!element.src.endsWith(DEFAULT_AVATAR)) {
            element.src = DEFAULT_AVATAR;
          }
        }}
      />
      {children}
    </div>
  );
}
