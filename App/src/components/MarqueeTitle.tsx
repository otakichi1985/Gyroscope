import { useEffect, useRef, useState } from "react";
import { useAppearanceStore } from "../stores/appearanceStore";

/** Scroll speed, shared by both the reveal leg and the wrap-around leg. */
const PX_PER_SEC = 70;
/**
 * Overflow below this is not worth animating: there is essentially nothing
 * hidden, and moving a couple of pixels reads as the text jittering rather
 * than scrolling.
 */
const MIN_DISTANCE_PX = 6;
/** Pause after the pointer arrives, before the first scroll leg starts. */
const HOVER_DELAY_MS = 700;
/**
 * Pause at the start of every *repeat* lap. The first lap skips it (see the
 * negative `delay` where the animation is created) because HOVER_DELAY_MS
 * has already just elapsed -- so hovering still starts moving after ~0.7s,
 * while a title that has already scrolled once sits still noticeably longer
 * before going again, which is what makes a repeat pass readable from the
 * top rather than feeling like it immediately restarts (user request).
 */
const START_HOLD_SEC = 2;
/** Pause once the tail of the title is fully visible. */
const END_HOLD_SEC = 2.5;
/**
 * Blank space between the two copies of the title (see the component doc).
 * Wide enough that the incoming copy clearly reads as a fresh pass rather
 * than the same sentence running on.
 */
const GAP_PX = 64;

interface MarqueeTitleProps {
  text: string;
  /** Applied to the text element(s) (font size/weight). */
  textClassName: string;
  /**
   * Applied to the outer (overflow-hidden) container -- e.g. `flex-1` where
   * the caller's flex row needs the title to grow into the leftover space.
   */
  className?: string;
}

/**
 * Truncated titles just showed "…" with no way to read the rest without
 * opening the article (user request: an LED-sign / 電光掲示板 effect, but
 * only on the hovered row -- every visible row scrolling at once would be
 * far too noisy for a list meant to be scanned at a glance).
 *
 * ## Why two copies of the text
 *
 * Earlier versions scrolled a single copy to the end and then jumped back
 * to the start to loop. Every attempt to make that jump invisible failed,
 * and the repeated report was the same: something visibly "twitches" or
 * "micro-adjusts" at the end of each pass. Fading across the jump read as
 * an unwanted ease; a `linear` reset interpolated the return trip across
 * its (short) duration, so the text visibly slid back; a `step-end` reset
 * removed the interpolation but the jump itself is still a
 * one-frame discontinuity, which is exactly what the eye was catching.
 *
 * The fix is to stop trying to hide the jump and instead make it render
 * *identically* on both sides. The track holds the title twice, separated
 * by GAP_PX. A lap scrolls exactly `textWidth + GAP_PX`, at which point the
 * second copy sits pixel-for-pixel where the first copy started -- so the
 * wrap back to offset 0 is not merely fast, it is a no-op visually, no
 * matter how the engine interpolates around it. A real LED sign works the
 * same way, and it makes the restart read as the text continuing to travel
 * rather than snapping.
 */
export function MarqueeTitle({ text, textClassName, className = "" }: MarqueeTitleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const delayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Moving text is a genuine accessibility concern (WCAG 2.2.2 asks for a
  // way to stop it), and it doubles as an isolation switch: if something
  // still looks off in the timeline with this turned off, the cause is
  // elsewhere, not here.
  const enabled = useAppearanceStore((s) => s.titleMarquee);

  /** Overflow in px of the (single) title against its container, or 0. */
  function overflowPx() {
    const container = containerRef.current;
    const textEl = measureRef.current;
    if (!container || !textEl) return 0;
    return textEl.scrollWidth - container.clientWidth;
  }

  // Entry rows are virtualized (EntryList.tsx), so these mount/unmount
  // constantly while scrolling -- a hover timer left pending past unmount
  // would fire against a dead component. Cleared unconditionally here
  // rather than only in handleLeave, which a scrolled-away row never gets.
  useEffect(() => () => clearTimeout(delayTimer.current), []);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const track = trackRef.current;
    const textEl = measureRef.current;
    if (!container || !track || !textEl) return;

    // Rounded so both the reveal distance and the lap distance are whole
    // pixels: the *endpoints* of the motion land exactly on the pixel grid,
    // and the lap distance matching the second copy's offset exactly is
    // what makes the wrap-around seamless.
    const textWidth = Math.round(textEl.offsetWidth);
    const revealPx = textWidth - container.clientWidth;
    if (revealPx < MIN_DISTANCE_PX) return;
    const lapPx = textWidth + GAP_PX;

    // Leg durations, then keyframe offsets derived from the running total.
    // Deriving every offset from `at()` keeps them monotonically increasing
    // by construction -- an earlier version computed them from separately
    // written sums, one of which evaluated to exactly 1.0, putting it past
    // the keyframe after it. `element.animate()` throws on out-of-order
    // offsets, and that exception (uncaught) blanked the entire window.
    const revealSec = revealPx / PX_PER_SEC;
    const exitSec = (lapPx - revealPx) / PX_PER_SEC;
    const totalSec = START_HOLD_SEC + revealSec + END_HOLD_SEC + exitSec;
    const at = (elapsedSec: number) => elapsedSec / totalSec;

    // Every segment is `linear`, and every transform is a `translate3d`.
    //
    // A previous attempt quantised the motion with `steps(px, ...)` to keep
    // the text on whole pixels, on the theory that subpixel positions were
    // causing the glyphs to be re-rasterised (which reads as the letters
    // subtly changing weight, not as the block sliding). Quantising was the
    // wrong cure: at PX_PER_SEC=70 that is 70 steps a second against a 60Hz
    // display, and two near-but-unequal rates beat against each other --
    // most frames advance 1px, some advance 2px, and the motion visibly
    // judders. "Faster than the frame rate so it cannot look coarser" was
    // simply wrong reasoning; near-but-not-equal is the worst case.
    //
    // `translate3d` addresses the original concern properly instead. It
    // promotes the track to its own compositor layer, so the text is
    // rasterised once and the *layer* is what moves -- the compositor
    // positions it with subpixel precision without ever re-rasterising the
    // glyphs. That matters especially here because the entry card above
    // this element uses `backdrop-blur`, and a plain 2D transform inside a
    // backdrop-filtered ancestor can end up repainting on the main thread
    // every frame, re-rasterising the text as it goes.
    const atX = (px: number) => `translate3d(-${px}px, 0, 0)`;

    let animation: Animation;
    try {
      animation = track.animate(
        [
          // Beginning of the title, held long enough to read.
          { transform: atX(0), offset: 0, easing: "linear" },
          { transform: atX(0), offset: at(START_HOLD_SEC), easing: "linear" },
          // Reveal leg: scroll until the tail is flush with the right edge.
          { transform: atX(revealPx), offset: at(START_HOLD_SEC + revealSec), easing: "linear" },
          // Hold on the tail.
          {
            transform: atX(revealPx),
            offset: at(START_HOLD_SEC + revealSec + END_HOLD_SEC),
            easing: "linear",
          },
          // Exit leg: the first copy slides away and the second copy lands
          // exactly where the first began -- so wrapping to offset 0 is
          // visually a no-op. No cut, no fade, nothing to notice.
          { transform: atX(lapPx), offset: 1 },
        ],
        {
          duration: totalSec * 1000,
          iterations: Infinity,
          easing: "linear",
          // Negative delay starts playback partway in, skipping the *first*
          // lap's opening hold -- the HOVER_DELAY_MS wait has already served
          // that purpose by the time this runs. Every later lap still gets
          // the full START_HOLD_SEC, which is what makes a repeat pass
          // readable from the top (user request: keep the initial hover
          // wait as it was, but pause longer before each repeat).
          delay: -START_HOLD_SEC * 1000,
        },
      );
    } catch (err) {
      // Belt-and-braces against the offset-ordering crash noted above:
      // worst case the title simply sits unscrolled, which is a far
      // smaller problem than taking down the window.
      console.error("MarqueeTitle: failed to start animation", err);
      return;
    }
    return () => animation.cancel();
  }, [active, text]);

  function handleEnter() {
    // Checked up front so a title that is not actually clipped never even
    // schedules the timer.
    if (!enabled || overflowPx() < MIN_DISTANCE_PX) return;
    delayTimer.current = setTimeout(() => setActive(true), HOVER_DELAY_MS);
  }

  function handleLeave() {
    clearTimeout(delayTimer.current);
    setActive(false);
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={`min-w-0 overflow-hidden ${className}`}
    >
      {/* At rest the track is a plain block filling the container, so the
          single span's `truncate` has a width to truncate against and the
          row renders exactly as it would without this component at all.
          Only while scrolling does it become `flex w-max`, letting both
          copies size to their content and overflow. Both states are
          block-level: switching to `inline-block` instead would change
          layout modes and re-seat the box on a line box (baseline/strut),
          which can shift it by a fraction of a pixel. */}
      <div ref={trackRef} className={active ? "flex w-max" : "block"}>
        <span ref={measureRef} className={`whitespace-nowrap ${active ? "" : "block truncate"} ${textClassName}`}>
          {text}
        </span>
        {/* Second copy exists only while scrolling, and only to make the
            wrap-around seamless -- hidden from assistive tech so the title
            is not announced twice. */}
        {active && (
          <span
            aria-hidden="true"
            style={{ paddingLeft: GAP_PX }}
            className={`whitespace-nowrap ${textClassName}`}
          >
            {text}
          </span>
        )}
      </div>
    </div>
  );
}
