import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ArrowRight,
  ScanLine,
  Layers,
  ChartNoAxesCombined,
  Leaf,
  Check,
  Camera,
  Users,
  Building2,
  UtensilsCrossed,
  LoaderCircle,
} from "lucide-react";
import { Logo, PlateView, ErrorBox } from "./ui";
import { post } from "./api";
import { useApp } from "./main";
import { roleHome } from "./auth-routes";

export function Landing() {
  const { user, settings } = useApp();
  const [heroState, setHeroState] = useState("Full plate");
  const remaining = ["After", "Waste", "Second Serve"].includes(heroState);
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <nav>
          <a href="#how">The process</a>
          <a href="#intelligence">Our technology</a>
          <a href="#for-everyone">Who it’s for</a>
        </nav>
        <div className="row">
          <Link className="text-link" to={user ? "/dashboard" : "/login"}>
            {user ? "Workspace" : "Log in"}
          </Link>
          <Link className="button small" to={user ? "/analyze" : "/register"}>
            Get started <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="pill">
                <span className="live-dot" /> A little intelligence. A lot less
                waste.
              </span>
              <h1>
                Good food.
                <br />
                Better choices.
                <br />
                <span>A second chance.</span>
              </h1>
              <p>
                See what’s left. Understand what matters.
                <br />
                Turn every plate into a step toward less food waste.
              </p>
              <div className="hero-actions">
                <Link className="button" to={user ? "/analyze" : "/register"}>
                  Analyze a meal <ArrowUpRight size={18} />
                </Link>
                <a className="button secondary" href="#how">
                  Explore Second Serve <ArrowRight size={17} />
                </a>
              </div>
              <div className="hero-proof">
                <span className="proof-icon">
                  <ScanLine size={18} />
                </span>
                <span>
                  Computer vision. Human perspective.
                  <br />
                  <strong>Intelligence you can actually act on.</strong>
                </span>
              </div>
            </motion.div>
          </div>
          <div className="hero-visual">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="scene-label">A NEW PERSPECTIVE ON YOUR PLATE</span>
            <PlateView
              remaining={remaining}
              settings={settings}
              stage={
                heroState === "Capture"
                  ? "Scanning plate"
                  : heroState === "Segment"
                    ? "Segmenting portions"
                    : heroState
              }
            />
            <div className="floating-tag tag-top">
              <span className="scan-icon">
                <ScanLine size={18} />
              </span>
              <div>
                <strong>A closer look</strong>
                <small>From portions to possibilities</small>
              </div>
              <span className="live-dot" />
            </div>
            <div className="floating-tag tag-bottom">
              <Leaf size={19} />
              <div>
                <strong>Less left behind.</strong>
                <small>More to look forward to.</small>
              </div>
            </div>
            <div className="scene-switch hero-state-controls">
              {[
                "Full plate",
                "Capture",
                "Segment",
                "After",
                "Waste",
                "Second Serve",
              ].map((s) => (
                <button
                  key={s}
                  className={heroState === s ? "active" : ""}
                  onClick={() => setHeroState(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <small className="scene-disclaimer">
              Illustrative 3D experience · drag to explore
            </small>
          </div>
        </section>
        <div className="principles-strip">
          <span>THOUGHTFULLY BUILT FOR</span>
          <span>
            <UtensilsCrossed size={18} /> Mindful meals
          </span>
          <span>
            <ScanLine size={18} /> Visible insights
          </span>
          <span>
            <Leaf size={18} /> Everyday impact
          </span>
          <span>
            <Users size={18} /> Better operations
          </span>
        </div>
        <section className="landing-section" id="how">
          <div className="section-heading">
            <div>
              <span className="eyebrow">FROM PLATE TO PERSPECTIVE</span>
              <h2>
                Four small steps.
                <br />
                One meaningful change.
              </h2>
            </div>
            <p>
              The story doesn’t end with the last bite.
              <br />
              That’s where understanding begins.
            </p>
          </div>
          <div className="steps-grid">
            {[
              [
                Camera,
                "Capture",
                "A photo before. A photo after. The same plate, a fuller picture.",
              ],
              [
                ScanLine,
                "Understand",
                "Identify visible regions and review transparent portion estimates.",
              ],
              [
                Layers,
                "Compare",
                "Align both plates to see what remains and what changed.",
              ],
              [
                Leaf,
                "Reduce",
                "Use your recorded patterns to make more thoughtful serving decisions.",
              ],
            ].map(([Icon, title, desc]: any, i) => (
              <motion.article
                whileHover={{ y: -5 }}
                className="step-card"
                key={title}
              >
                <span className="step-number">0{i + 1}</span>
                <Icon size={27} />
                <h3>{title}</h3>
                <p>{desc}</p>
              </motion.article>
            ))}
          </div>
        </section>
        <section className="intelligence-section" id="intelligence">
          <div className="vision-art">
            <div className="vision-circle">
              <div className="vision-region region-a" />
              <div className="vision-region region-b" />
              <div className="vision-region region-c" />
              <div className="scan-line" />
            </div>
            <span className="vision-caption">
              Illustration · segmentation, made visible
            </span>
          </div>
          <div>
            <span className="eyebrow">MORE THAN MEETS THE EYE</span>
            <h2>
              Your plate has a story.
              <br />
              <em>Let’s understand it.</em>
            </h2>
            <p>
              Real image processing meets practical food intelligence. See the
              evidence, adjust the estimates, and keep a record you can trust.
            </p>
            <ul className="feature-list">
              <li>
                <Check /> Plate alignment & region segmentation
              </li>
              <li>
                <Check /> Calibrated, area-based portion estimates
              </li>
              <li>
                <Check /> Before / after comparison & mask review
              </li>
              <li>
                <Check /> Human corrections, saved with history
              </li>
            </ul>
            <Link
              className="text-link green"
              to={user ? "/analyze" : "/register"}
            >
              See your plate differently <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>
        <section className="landing-section" id="for-everyone">
          <div className="section-heading">
            <div>
              <span className="eyebrow">A PLACE AT EVERY TABLE</span>
              <h2>
                Better for your plate.
                <br />
                Better for the bigger picture.
              </h2>
            </div>
            <p>
              Connected insights for people, cafeterias,
              <br />
              and the organizations bringing them together.
            </p>
          </div>
          <div className="role-grid">
            {[
              [
                Users,
                "For you",
                "Notice your patterns. Make your next serving a little more intentional.",
              ],
              [
                UtensilsCrossed,
                "For cafeterias",
                "Understand food, meal-time and location waste with recorded data.",
              ],
              [
                Building2,
                "For organizations",
                "Bring teams together around measurable operational improvements.",
              ],
            ].map(([Icon, title, desc]: any) => (
              <article className="panel" key={title}>
                <Icon />
                <h3>{title}</h3>
                <p>{desc}</p>
                <Link to="/register" className="text-link">
                  Find your perspective <ArrowUpRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="final-cta">
          <span className="eyebrow">GOOD FOOD DESERVES MORE</span>
          <h2>
            Give every plate
            <br />
            <em>a second chance.</em>
          </h2>
          <Link className="button" to={user ? "/analyze" : "/register"}>
            Start with your next meal <ArrowUpRight size={18} />
          </Link>
          <p>No perfect choices. Just more informed ones.</p>
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <p>Giving Every Plate a Second Chance</p>
        <span>Food intelligence, thoughtfully made.</span>
      </footer>
    </div>
  );
}

const demoAccounts = [
  ["User", "user@secondserve.local", "SecondServe@User123"],
  ["Cafeteria Manager", "manager@secondserve.local", "SecondServe@Manager123"],
  ["Organization Admin", "orgadmin@secondserve.local", "SecondServe@Org123"],
  ["Super Admin", "admin@secondserve.local", "SecondServe@Admin123"],
];
export function Auth({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "reset";
}) {
  const { setUser, notice, setNotice } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const title = {
    login: "Welcome to your second chance.",
    register: "A fresh perspective starts here.",
    forgot: "Let’s get you back in.",
    reset: "A new start.",
  }[mode];
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (mode === "register" && data.password !== data.confirm)
        throw new Error("Your passwords do not match.");
      delete data.confirm;
      if (mode === "forgot") {
        const r = await post("/auth/forgot-password", data);
        setMessage(r.message);
      } else if (mode === "reset") {
        const r = await post("/auth/reset-password", {
          password: data.password,
          token: params.get("token") || "",
        });
        setMessage(r.message);
      } else {
        const u = await post(
          "/auth/" + mode,
          mode === "login" ? { ...data, remember } : data,
        );
        setUser(u);
        setNotice("");
        navigate(roleHome(u.role));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout immersive-auth">
      <div className="auth-story">
        <Logo />
        <div>
          <span className="eyebrow">A BETTER FUTURE IS ON THE TABLE</span>
          <h1>
            Every plate.
            <br />A possibility.
            <br />
            <em>A second chance.</em>
          </h1>
          <PlateView
            settings={{ reduce_motion: false }}
            stage="Scanning plate"
          />
          <div className="auth-scene-caption">
            <span className="live-dot" />
            FOOD × VISION × INTENTION
          </div>
          <p>Giving Every Plate a Second Chance</p>
        </div>
        <small>
          Illustrative 3D scene · Real image intelligence in your workspace.
        </small>
      </div>
      <main id="main" className="auth-form-wrap">
        <Link className="text-link" to="/">
          ← Back to Second Serve
        </Link>
        <form className="auth-form" onSubmit={submit}>
          <span className="eyebrow">SECOND SERVE / {mode.toUpperCase()}</span>
          <h1>{title}</h1>
          <p>
            {mode === "register"
              ? "Create your personal workspace. Your first insight is one meal away."
              : "Step inside. See food differently."}
          </p>
          <ErrorBox error={error || notice} />
          {message ? (
            <div className="success" role="status">
              {message}
              <Link to="/login">Go to sign in →</Link>
            </div>
          ) : (
            <>
              {mode === "register" && (
                <>
                  <label>
                    Your name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder="Alex Morgan"
                    />
                  </label>
                  <label>
                    Organization
                    <input
                      name="organization"
                      required
                      minLength={2}
                      maxLength={120}
                      placeholder="My workspace"
                      defaultValue="My workspace"
                    />
                  </label>
                </>
              )}
              {mode !== "reset" && (
                <label>
                  Email address
                  <input
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    type="email"
                    required
                    placeholder="you@example.com"
                  />
                </label>
              )}
              {mode !== "forgot" && (
                <label>
                  Password
                  <input
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    type="password"
                    required
                    minLength={mode === "login" ? 1 : 10}
                    maxLength={128}
                    placeholder={
                      mode === "login"
                        ? "Your password"
                        : "At least 10 characters"
                    }
                  />
                </label>
              )}
              {mode === "register" && (
                <label>
                  Confirm password
                  <input
                    name="confirm"
                    autoComplete="new-password"
                    type="password"
                    required
                    minLength={10}
                    maxLength={128}
                    placeholder="Repeat your password"
                  />
                </label>
              )}
              {mode === "login" && (
                <div className="between auth-options">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    Remember me for 7 days
                  </label>
                  <Link className="text-link" to="/forgot-password">
                    Forgot password?
                  </Link>
                </div>
              )}
              <button disabled={busy} className="button full">
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <>
                    {mode === "login"
                      ? "Sign in"
                      : mode === "register"
                        ? "Create account"
                        : mode === "forgot"
                          ? "Send reset link"
                          : "Update password"}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </>
          )}
          {["login", "register"].includes(mode) && (
            <p className="auth-alternative">
              {mode === "login"
                ? "New to Second Serve?"
                : "Already have an account?"}{" "}
              <Link to={mode === "login" ? "/register" : "/login"}>
                {mode === "login" ? "Create an account" : "Sign in"}
              </Link>
            </p>
          )}
          {mode === "login" && (
            <details className="demo-accounts">
              <summary>
                Explore with a local demo account{" "}
                <span className="badge">DEMO</span>
              </summary>
              <p>
                Choose a role to fill the form, then sign in through real
                authentication. Local demo installations only.
              </p>
              <div>
                {demoAccounts.map(([name, email, password]) => (
                  <button
                    type="button"
                    key={name}
                    onClick={() => {
                      setEmail(email);
                      setPassword(password);
                      setError("");
                    }}
                  >
                    {name}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            </details>
          )}
          <small className="muted">
            Secure sessions. Your data stays in your workspace.
          </small>
        </form>
      </main>
    </div>
  );
}
