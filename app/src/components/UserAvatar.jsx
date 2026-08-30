import { useEffect, useRef } from "react";
import { ANON_YOU_LABEL } from "../lib/shaderLibrary.js";

export default function UserAvatar({
  class: className,
  name,
  src,
  tooltip,
  onClick,
}) {
  const ref = useRef(null);
  const isAnonYou = name === ANON_YOU_LABEL;

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
      {...(className ? { class: className } : {})}
      src={src || ""}
      {...(isAnonYou ? { initials: "A" } : { name: name || "Anon" })}
    />
  );
  const avatar = onClick ? (
    <fig-button
      type="button"
      variant="ghost"
      icon="true"
      aria-label={`View ${name || "creator"} profile`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
    >
      {avatarImage}
    </fig-button>
  ) : (
    avatarImage
  );

  if (tooltip) {
    return <fig-tooltip text={tooltip}>{avatar}</fig-tooltip>;
  }

  return avatar;
}
