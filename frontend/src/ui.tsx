import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Leaf, LoaderCircle, AlertCircle } from "lucide-react";
import { api } from "./api";
const Plate = lazy(() => import("./Plate"));
function useMedia(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Second Serve home">
      <span className="logo-icon">
        <Leaf size={23} />
      </span>
      <span>
        second<span className="muted">serve</span>
        <i>®</i>
      </span>
    </Link>
  );
}
export function Empty({
  title = "A fresh start.",
  text = "Your next meal is the first step toward less waste.",
  action = true,
}: {
  title?: string;
  text?: string;
  action?: boolean;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Leaf />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <Link className="button" to="/analyze">
          Analyze a meal <ArrowUpRight size={17} />
        </Link>
      )}
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error" role="alert">
      <AlertCircle size={18} />
      {error}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div
      className="loading-skeleton"
      role="status"
      aria-label="Loading your plate intelligence"
    >
      <div className="skeleton-title" />
      <div className="skeleton-panels">
        {[0, 1, 2].map((i) => (
          <div className="skeleton-panel" key={i} />
        ))}
      </div>
      <span>
        <LoaderCircle className="spin" size={16} />
        Gathering your plate intelligence…
      </span>
    </div>
  );
}
export function useData<T = any>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    setError("");
    setData(null);
    api<T>(url)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [url, version]);
  return { data, error, reload: () => setVersion((v) => v + 1), setData };
}
class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function PlateView({
  foods,
  remaining = false,
  onSelect,
  beforeFraction,
  selected,
  stage,
  settings = {},
}: any) {
  const mobile = useMedia("(max-width: 600px)");
  const motionReduced = useMedia("(prefers-reduced-motion: reduce)");
  const [supported] = useState(() => {
    try {
      const context = document.createElement("canvas").getContext("webgl2");
      if (context) context.getExtension("WEBGL_lose_context")?.loseContext();
      return !!context;
    } catch {
      return false;
    }
  });
  const fallback = (
    <div className="plate-fallback">
      <div className="flat-plate">
        {(foods || [{ label: "Illustrative serving" }]).map(
          (f: any, i: number) => (
            <button
              key={i}
              title={f.label}
              onClick={() => onSelect?.(i)}
              style={{ transform: `rotate(${i * 110}deg) translate(38px)` }}
              aria-label={f.label}
            >
              {foods
                ? `${Math.round(beforeFraction !== undefined ? f.remaining_quantity + (f.initial_quantity - f.remaining_quantity) * beforeFraction : remaining ? f.remaining_quantity : f.initial_quantity)}g`
                : ""}
            </button>
          ),
        )}
      </div>
      <small>
        {foods
          ? "Estimated portions · simplified view"
          : "Illustrative plate · simplified view"}
      </small>
    </div>
  );
  return (
    <div
      className="plate-view"
      aria-label="Interactive three dimensional plate"
    >
      {!supported || settings.performance || mobile ? (
        fallback
      ) : (
        <Boundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <Plate
              foods={foods}
              remaining={remaining}
              onSelect={onSelect}
              beforeFraction={beforeFraction}
              selected={selected}
              stage={stage}
              reduced={settings.reduce_motion || motionReduced}
            />
          </Suspense>
        </Boundary>
      )}
    </div>
  );
}
export function PageHead({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {children}
    </header>
  );
}
