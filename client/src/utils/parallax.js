/**
 * Shared mousemove parallax for the big cards' hero backgrounds: the cursor
 * position within the element nudges --hero-x/--hero-y a couple of px, which
 * .parallax-hero (base.css) translates the backdrop by. Used by HomeView
 * (latest edition + activities), MapView and MapperView.
 *
 * Returns the event handler; pass a getter so the element ref is read at
 * event time, not at setup time:
 *
 *   const handleCardMove = useParallax(() => cardRef.value);
 *   <div @mousemove="handleCardMove">…
 *
 * No-ops on touch devices — no mousemove fires there, the backdrop simply
 * stays static.
 */
export function useParallax(getElement) {
  return (e) => {
    const el = getElement();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 4; // up to 2px each way
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 4;
    el.style.setProperty('--hero-x', `${x}px`);
    el.style.setProperty('--hero-y', `${y}px`);
  };
}
