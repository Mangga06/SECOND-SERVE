import React, { createContext, useContext, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  Link,
  useNavigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { MotionConfig, motion } from "framer-motion";
import {
  LayoutDashboard,
  ScanLine,
  ChartNoAxesCombined,
  History,
  FileDown,
  Settings,
  ShieldCheck,
  Bell,
  LogOut,
  Menu,
  ArrowUpRight,
  Sun,
  Moon,
  X,
  Activity,
} from "lucide-react";
import { api, post } from "./api";
import { Logo, Loading, ErrorBox, useData } from "./ui";
import { Landing, Auth } from "./public";
import {
  Dashboard,
  Analytics,
  HistoryPage,
  Reports,
  Alerts,
  InsightsPage,
} from "./insights";
import { Analyze, Result } from "./analysis";
import { SettingsPage, AdminPage } from "./management";
import { FitPage } from "./fit";
import "./style.css";
import "./identity.css";

export const Context = createContext<any>(null);
export const useApp = () => useContext(Context);
function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>({
    theme: localStorage.getItem("theme") || "dark",
  });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
    const expired = () => {
      setUser(null);
      setNotice("Your session expired. Sign in again to continue.");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (user)
      api("/settings")
        .then(setSettings)
        .catch(() => {});
  }, [user?.id]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    localStorage.setItem("theme", settings.theme);
    document.documentElement.dataset.motion = settings.reduce_motion
      ? "reduced"
      : "full";
  }, [settings]);
  return (
    <Context.Provider
      value={{ user, setUser, settings, setSettings, notice, setNotice }}
    >
      <MotionConfig reducedMotion={settings.reduce_motion ? "always" : "user"}>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {loading ? (
          <Loading />
        ) : (
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/register" element={<Auth mode="register" />} />
            <Route path="/forgot-password" element={<Auth mode="forgot" />} />
            <Route path="/reset-password" element={<Auth mode="reset" />} />
            <Route
              element={user ? <Shell /> : <Navigate to="/login" replace />}
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route
                path="/manager"
                element={
                  user?.role === "CAFETERIA_MANAGER" ||
                  user?.role === "SUPER_ADMIN" ? (
                    <Dashboard />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )
                }
              />
              <Route
                path="/organization"
                element={
                  ["ORGANIZATION_ADMIN", "SUPER_ADMIN"].includes(user?.role) ? (
                    <Dashboard />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )
                }
              />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/fit" element={<FitPage />} />
              <Route path="/profile" element={<SettingsPage />} />
              <Route path="/analyze" element={<Analyze />} />
              <Route path="/analysis/:id" element={<Result />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/admin"
                element={
                  ["ORGANIZATION_ADMIN", "SUPER_ADMIN"].includes(user?.role) ? (
                    <AdminPage />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )
                }
              />
            </Route>
            <Route
              path="*"
              element={
                <div className="auth-page">
                  <Logo />
                  <h1>This plate went missing.</h1>
                  <Link className="button" to="/">
                    Return home
                  </Link>
                </div>
              }
            />
          </Routes>
        )}
      </MotionConfig>
    </Context.Provider>
  );
}
function Shell() {
  const { user, setUser, settings, setSettings } = useApp();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const alerts = useData("/alerts");
  const home =
    user.role === "CAFETERIA_MANAGER"
      ? "/manager"
      : user.role === "ORGANIZATION_ADMIN"
        ? "/organization"
        : "/dashboard";
  const links = [
    [home, "Overview", LayoutDashboard],
    ["/analyze", "Analyze", ScanLine],
    ["/history", "History", History],
    ["/insights", "Insights", LeafIcon],
    ["/fit", "Fit", Activity],
    ["/analytics", "Analytics", ChartNoAxesCombined],
    ["/reports", "Reports", FileDown],
  ] as const;
  async function logout() {
    try {
      await post("/auth/logout");
      setUser(null);
      setProfile(false);
      navigate("/login", { replace: true });
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    setOpen(false);
    setProfile(false);
  }, [location.pathname]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProfile(false);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return (
    <div className="spatial-app">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="floating-header">
        <Logo />
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map(([path, name, Icon]) => (
            <NavLink key={path} to={path}>
              <Icon size={15} />
              {name}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <Link
            className="icon-button alert-indicator"
            to="/alerts"
            aria-label="Alerts"
          >
            <Bell size={18} />
            {settings.notifications &&
              alerts.data?.some((a: any) => !a.read) && <span />}
          </Link>
          <button
            className="icon-button"
            aria-label="Toggle color theme"
            onClick={() =>
              setSettings({
                ...settings,
                theme: settings.theme === "dark" ? "light" : "dark",
              })
            }
          >
            {settings.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="profile-menu-wrap">
            <button
              className="profile-trigger"
              aria-label="Open profile menu"
              aria-expanded={profile}
              aria-controls="profile-menu"
              onClick={() => setProfile(!profile)}
            >
              <span className="avatar">{user.name[0].toUpperCase()}</span>
              <span>
                {user.name.split(" ")[0]}
                <small>{user.role.replaceAll("_", " ").toLowerCase()}</small>
              </span>
            </button>
            {profile && (
              <div id="profile-menu" className="profile-dropdown">
                <strong>{user.name}</strong>
                <small>{user.email}</small>
                <span className="badge">{user.role.replaceAll("_", " ")}</span>
                <Link to="/profile">Profile & preferences</Link>
                <Link to="/settings">
                  <Settings size={15} />
                  Settings
                </Link>
                {user.role === "CAFETERIA_MANAGER" && (
                  <Link to="/manager">Open Manager Dashboard</Link>
                )}
                {["ORGANIZATION_ADMIN", "SUPER_ADMIN"].includes(user.role) && (
                  <Link to="/admin">
                    <ShieldCheck size={15} />
                    Open Admin Panel
                  </Link>
                )}
                <button onClick={logout}>
                  <LogOut size={15} />
                  Logout
                </button>
              </div>
            )}
          </div>
          <button
            className="nav-menu-toggle icon-button"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {open && (
        <nav className="mobile-nav-panel" aria-label="Mobile navigation">
          {links.map(([path, name, Icon]) => (
            <NavLink key={path} to={path}>
              <Icon size={18} />
              {name}
            </NavLink>
          ))}
          <NavLink to="/settings">
            <Settings size={18} />
            Settings
          </NavLink>
          {["ORGANIZATION_ADMIN", "SUPER_ADMIN"].includes(user.role) && (
            <NavLink to="/admin">
              <ShieldCheck size={18} />
              Administration
            </NavLink>
          )}
          <button onClick={logout}>
            <LogOut size={18} />
            Logout
          </button>
        </nav>
      )}
      <main id="main" className="spatial-content">
        <ErrorBox error={error} />
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.25 }}
        >
          <Outlet />
        </motion.div>
      </main>
      <footer className="spatial-footer">
        <Logo />
        <span>Giving Every Plate a Second Chance</span>
        <span className="row">
          <span className="live-dot" />
          Intelligence with a human perspective
        </span>
      </footer>
    </div>
  );
}
function LeafIcon({ size = 18 }: { size?: number }) {
  return <span style={{ fontSize: size, lineHeight: 1 }}>↗</span>;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
