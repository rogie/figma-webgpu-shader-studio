import { useEffect, useMemo, useRef, useState } from "react";
import { COMPOSITION_KIND } from "../lib/composition.js";
import { buildShaderLibraryCards } from "../lib/shaderLibrary.js";
import {
  getThumbnailUrls,
  getProfileByHandleOrId,
  getProfileShaderCounts,
  listProfileShaders,
} from "../services/shaders.js";
import ShaderCard from "./ShaderCard.jsx";
import UserAvatar from "./UserAvatar.jsx";

const PAGE_SIZE = 48;

function groupCards(cards) {
  const groups = [
    [COMPOSITION_KIND, "Compositions"],
    ["effect", "Shader effects"],
    ["fill", "Shader fills"],
  ];
  return groups.flatMap(([kind, label]) => {
    const matches = cards.filter((card) => card.kind === kind);
    return matches.length
      ? [
          {
            key: `profile-separator:${kind}`,
            separatorLabel: label,
          },
          ...matches,
        ]
      : [];
  });
}

export default function ProfileView({
  identifier,
  user,
  onCanonicalIdentifier,
  onOpenShader,
  onNotice,
}) {
  const chooserRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [shaders, setShaders] = useState([]);
  const [thumbnailUrls, setThumbnailUrls] = useState({});
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({
    compositions: 0,
    effects: 0,
    fills: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const ownProfile = Boolean(profile && user?.id === profile.id);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setShaders([]);
    setThumbnailUrls({});
    setTotal(0);
    setCounts({ compositions: 0, effects: 0, fills: 0 });
    setError("");
    setLoading(true);

    (async () => {
      try {
        const nextProfile = await getProfileByHandleOrId(identifier);
        if (!nextProfile) throw new Error("This creator profile was not found.");
        const [result, nextCounts] = await Promise.all([
          listProfileShaders(nextProfile.id, {
            includePrivate: false,
            limit: PAGE_SIZE,
          }),
          getProfileShaderCounts(nextProfile.id, { includePrivate: false }),
        ]);
        const { full: urls } = await getThumbnailUrls(result.shaders);
        if (cancelled) return;
        setProfile(nextProfile);
        setShaders(result.shaders);
        setThumbnailUrls(
          Object.fromEntries(
            result.shaders.map((shader) => [
              shader.id,
              urls[shader.id] || null,
            ]),
          ),
        );
        setTotal(result.total);
        setCounts(nextCounts);
        if (nextProfile.handle && nextProfile.handle !== identifier) {
          onCanonicalIdentifier?.(nextProfile.handle);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError.message || String(loadError);
          if (message === "This creator profile was not found.") {
            setError(message);
          } else {
            setError("Could not load this creator profile.");
            onNotice?.(message, { error: true });
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identifier, onCanonicalIdentifier, onNotice, user?.id]);

  useEffect(() => {
    const chooser = chooserRef.current;
    if (!chooser) return;
    const onChange = (event) => {
      if (typeof event.detail !== "string") return;
      const shaderId = event.detail.startsWith("cloud:")
        ? event.detail.slice("cloud:".length)
        : event.detail;
      const shader = shaders.find((item) => item.id === shaderId);
      if (shader) onOpenShader?.(shader.id, shader.kind);
    };
    chooser.addEventListener("change", onChange);
    return () => chooser.removeEventListener("change", onChange);
  }, [loading, onOpenShader, shaders]);

  const cards = useMemo(
    () =>
      buildShaderLibraryCards({
        drafts: [],
        cloudShaders: shaders,
        cloudThumbnails: thumbnailUrls,
        user: ownProfile ? user : null,
      }),
    [ownProfile, shaders, thumbnailUrls, user],
  );
  const visibleCards = useMemo(() => groupCards(cards), [cards]);

  const loadMore = async () => {
    if (!profile || loadingMore || shaders.length >= total) return;
    setLoadingMore(true);
    setError("");
    try {
      const result = await listProfileShaders(profile.id, {
        includePrivate: false,
        offset: shaders.length,
        limit: PAGE_SIZE,
      });
      const { full: urls } = await getThumbnailUrls(result.shaders);
      setShaders((current) => [...current, ...result.shaders]);
      setThumbnailUrls((current) => ({
        ...current,
        ...Object.fromEntries(
          result.shaders.map((shader) => [
            shader.id,
            urls[shader.id] || null,
          ]),
        ),
      }));
      setTotal(result.total);
    } catch (loadError) {
      const message = loadError.message || String(loadError);
      setError("");
      onNotice?.(message, { error: true });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleLabel = profile?.handle
    ? `@${profile.handle}`
    : profile
      ? `@${profile.id}`
      : `@${identifier}`;
  const profileStats = [
    [counts.compositions, "composition"],
    [counts.effects, "effect"],
    [counts.fills, "fill"],
  ]
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}${count === 1 ? "" : "s"}`)
    .join(" · ");

  return (
    <main className="home-nav profile-view">
      {profile && (
        <section className="profile-identity" aria-label="Creator profile">
          <UserAvatar
            class="profile-avatar"
            src={profile.avatar_url}
            name={profile.display_name || "Creator"}
            isYou={ownProfile}
          />
          <div className="profile-identity-copy">
            <h1>{profile.display_name || "Creator"}</h1>
            <p className="profile-handle">{handleLabel}</p>
            {profileStats && <p className="profile-stats">{profileStats}</p>}
          </div>
        </section>
      )}

      {loading ? (
        <div className="profile-state profile-state--loading" role="status">
          <fig-spinner />
          Loading profile…
        </div>
      ) : error && !profile ? (
        <div className="profile-state" role="alert">
          {error}
        </div>
      ) : visibleCards.length ? (
        <fig-chooser
          ref={chooserRef}
          value=""
          layout="grid"
          overflow="scrollbar"
          loop=""
        >
          {visibleCards.map((card) =>
            card.separatorLabel ? (
              <fig-separator key={card.key} label={card.separatorLabel} />
            ) : (
              <fig-choice
                key={card.key}
                value={card.key}
                aria-label={card.name}
              >
                <ShaderCard
                  src={card.thumbnailUrl}
                  label={card.name}
                  sublabel={card.origin === "public" ? "Published" : "Draft"}
                  size="large"
                  published={card.origin === "public"}
                  authorName={card.authorName || card.authorLabel}
                  authorAvatarUrl={card.authorAvatarUrl}
                  showAvatar={false}
                  showPublishedIcon={false}
                  previewId={card.cloud.id}
                  previewKind={card.kind}
                  previewRevision={card.cloud.state_revision}
                  animated={Boolean(card.features?.isAnimated)}
                  interactive={Boolean(card.features?.usesMouse)}
                  audio={Boolean(card.features?.supportsAudio)}
                />
              </fig-choice>
            ),
          )}
        </fig-chooser>
      ) : (
        <div className="profile-state">
          {ownProfile
            ? "You haven’t published anything yet."
            : "This creator hasn’t published anything yet."}
        </div>
      )}

      {profile && shaders.length < total && (
        <div className="profile-load-more">
          <fig-button
            type="button"
            variant="secondary"
            disabled={loadingMore ? "" : undefined}
            onClick={loadMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </fig-button>
        </div>
      )}
      {error && profile && (
        <div className="profile-state" role="alert">
          {error}
        </div>
      )}
    </main>
  );
}
