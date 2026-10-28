import { avatarLayout, type Avatar as AvatarCrop } from "@/lib/avatar";

// Round profile picture: a cropped game image, else the Google photo, else
// the first letter of the name.
export function Avatar({
  avatar,
  image,
  name,
  size,
  className = "",
}: {
  avatar: AvatarCrop | null;
  image?: string | null;
  name: string;
  size: number;
  className?: string;
}) {
  const base = `relative shrink-0 overflow-hidden rounded-full bg-card-2 ${className}`;
  if (avatar) {
    const l = avatarLayout(size, avatar);
    return (
      <div className={base} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar.url}
          alt=""
          draggable={false}
          className="absolute max-w-none select-none"
          style={{ width: l.width, height: l.height, left: l.left, top: l.top }}
        />
      </div>
    );
  }
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" referrerPolicy="no-referrer" className={`${base} object-cover`} style={{ width: size, height: size }} />
    );
  }
  return (
    <div
      className={`${base} flex items-center justify-center font-bold text-fog`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.replace(/^@/, "").charAt(0).toUpperCase()}
    </div>
  );
}
