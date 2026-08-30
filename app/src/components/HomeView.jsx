import { useEffect, useRef } from "react";

export default function HomeView({
  choices,
  onChoice,
}) {
  const chooserRef = useRef(null);

  useEffect(() => {
    const node = chooserRef.current;
    if (!node || !onChoice) return;
    const handleChange = (event) => {
      if (typeof event.detail === "string") onChoice(event.detail);
    };
    node.addEventListener("change", handleChange);
    return () => node.removeEventListener("change", handleChange);
  }, [onChoice]);

  return (
    <nav className="home-nav">
      <fig-chooser
        ref={chooserRef}
        value=""
        layout="grid"
        overflow="scrollbar"
        loop=""
      >
        {choices}
      </fig-chooser>
    </nav>
  );
}
