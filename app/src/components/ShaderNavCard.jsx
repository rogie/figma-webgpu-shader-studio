import UserAvatar from "./UserAvatar.jsx";

export default function ShaderNavCard({
  src,
  label,
  sublabel,
  selected,
  size,
  published,
  authorName,
  authorAvatarUrl,
}) {
  return (
    <fig-card
      class={published ? "shader-nav-card is-published" : "shader-nav-card"}
      size={size}
      full=""
      src={src || undefined}
      alt={label}
      aspect-ratio="4/3"
      fit="cover"
      {...(selected ? { selected: "" } : {})}
    >
      <fig-footer>
        <label className="fig-card-label">
          <UserAvatar
            tooltip={authorName || "Anon"}
            src={authorAvatarUrl}
            name={authorName || "Anon"}
          />
          <h3>{label}</h3>
        </label>
        {sublabel && (
          <label
            className="fig-card-sublabel"
            aria-label={published ? "Published" : undefined}
          >
            {published ? (
              <fig-tooltip text="Published">
                <fig-icon name="globe" />
              </fig-tooltip>
            ) : (
              sublabel
            )}
          </label>
        )}
      </fig-footer>
    </fig-card>
  );
}
