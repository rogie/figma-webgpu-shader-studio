import { useEffect, useRef } from "react";
import { ANON_YOU_LABEL } from "../lib/shaderLibrary.js";
import "./UserAvatar.css";

export default function UserAvatar({
  class: className,
  name,
  src,
  tooltip,
  onClick,
  isYou = false,
  showName = false,
  size,
}) {
  const ref = useRef(null);
  const isAnonYou = name === ANON_YOU_LABEL;
  const isCurrentUser = isYou || isAnonYou;
  const avatarClass = ["user-avatar", className].filter(Boolean).join(" ");
  const profileLabel = isCurrentUser
    ? "View your profile"
    : `View ${name || "creator"} profile`;
  const tooltipText = onClick
    ? profileLabel
    : isCurrentUser
      ? "You"
      : tooltip;

  useEffect(() => {
    if (!isAnonYou) return;
    const el = ref.current;
    if (!el) return;
    el.removeAttribute("name");
    el.setAttribute("initials", "A");
  }, [isAnonYou]);

  const avatarImage = (
    <fig-avatar
      ref={isAnonYou ? ref : undefined}
      class={avatarClass}
      slot={showName && onClick ? "prepend" : undefined}
      src={src || ""}
      style={size ? { "--size": size } : undefined}
      {...(isAnonYou ? { initials: "A" } : { name: name || "Anon" })}
    />
  );
  const avatar = onClick ? (
    <fig-button
      class={showName ? "user-profile-pill" : "user-avatar-button"}
      type="button"
      variant="ghost"
      icon={showName ? undefined : "true"}
      pill={showName ? "" : undefined}
      aria-label={showName ? `${name || "Anon"} · ${profileLabel}` : profileLabel}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
    >
      {avatarImage}
      {showName && <span slot="label">{name || "Anon"}</span>}
    </fig-button>
  ) : showName ? (
    <span className="user-avatar-name">{avatarImage}<span>{name || "Anon"}</span></span>
  ) : (
    avatarImage
  );

  if (tooltipText) {
    return <fig-tooltip text={tooltipText}>{avatar}</fig-tooltip>;
  }

  return avatar;
}
