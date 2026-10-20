import {
  useRef,
  useState,
  useId,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";

type Props = {
  before: string;
  after: string;
  value: number;
  onChange: (value: number) => void;
};
export default function ImageComparison({
  before,
  after,
  value,
  onChange,
}: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const helpId = useId();
  const position = Math.min(100, Math.max(0, value));
  const update = (clientX: number) => {
    const rect = surface.current?.getBoundingClientRect();
    if (rect && rect.width > 0)
      onChange(
        Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      );
  };
  function start(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    pointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    update(e.clientX);
    e.currentTarget.querySelector("button")?.focus({ preventScroll: true });
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (pointer.current === e.pointerId) {
      e.preventDefault();
      update(e.clientX);
    }
  }
  function stop(e: PointerEvent<HTMLDivElement>) {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function keyboard(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 10 : 1;
    const next =
      e.key === "ArrowLeft"
        ? position - step
        : e.key === "ArrowRight"
          ? position + step
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 100
              : null;
    if (next !== null) {
      e.preventDefault();
      onChange(Math.max(0, Math.min(100, next)));
    }
  }
  return (
    <div
      className={"image-comparison " + (dragging ? "is-dragging" : "")}
      ref={surface}
      data-comparison={Math.round(position)}
    >
      <img
        className="comparison-base"
        src={before}
        alt="Before eating: normalized initial serving"
        draggable={false}
      />
      <img
        className="comparison-reveal"
        src={after}
        alt="After eating: normalized remaining food"
        draggable={false}
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
      />
      <span className="image-label before-label">BEFORE</span>
      <span className="image-label after-label">AFTER</span>
      <div
        className="comparison-drag-rail"
        style={{ left: `${position}%` }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={() => {
          pointer.current = null;
          setDragging(false);
        }}
      >
        <div className="comparison-divider" />
        <motion.button
          type="button"
          className="comparison-drag-button"
          role="slider"
          aria-label="Before and after image comparison"
          aria-describedby={helpId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${Math.round(position)}% before, ${Math.round(100 - position)}% after`}
          aria-orientation="horizontal"
          onKeyDown={keyboard}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          whileHover={{ scale: 1.07 }}
          whileTap={{ scale: 1.11 }}
          animate={{
            boxShadow: dragging
              ? "0 8px 32px #0007, 0 0 0 7px #c1e79b22"
              : "0 6px 24px #0005, 0 0 0 4px #ffffff0a",
          }}
          transition={{ duration: 0.15 }}
        >
          <ArrowLeft size={19} />
          <span className="handle-grip" />
          <ArrowRight size={19} />
        </motion.button>
        <span
          className={
            "comparison-position " + (dragging || focused ? "visible" : "")
          }
        >
          {Math.round(position)}% Before
        </span>
      </div>
      <span id={helpId} className="visually-hidden">
        Drag the button or divider horizontally. Use Left and Right arrows to
        adjust by one percent, Shift with arrows by ten, Home for all after, or
        End for all before.
      </span>
    </div>
  );
}
