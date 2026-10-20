# SECOND SERVE

**Giving Every Plate a Second Chance**

A connected food-waste intelligence application: React + TypeScript, interactive Three.js plates, a FastAPI backend, SQLAlchemy records, real before/after image processing, human review, analytics, and exports.

The working default is a **transparent classical computer-vision baseline**, not a pretrained food classifier. It detects contrasting image regions and estimates remaining area after plate normalization/alignment. Food names require human review unless you supply a validated food-segmentation checkpoint. RGB photographs do not measure exact food weight.

## Run locally on Windows

Prerequisites: Python 3.12+, Node.js 22+, npm.

From this repository:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m backend.demo_seed
cd frontend
npm.cmd ci
npm.cmd run build
cd ..
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**. The production frontend build is served by FastAPI from the same origin. Build it before starting the server.

Alternatively, the setup/build/start helper performs these steps:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start.ps1 -Demo
```

Without `-Demo`, it does not provision public demo credentials.

### Frontend development

Run the backend in one terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd frontend
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to port 8000. Do not switch between `localhost` and `127.0.0.1` during a session: browser cookies belong to their host.

## Local demo accounts

These accounts are created **only** by the explicit demo seed command. Their passwords are public and suitable only for a local demo.

| Role | Email | Password | Landing route |
|---|---|---|---|
| User | `user@secondserve.local` | `SecondServe@User123` | `/dashboard` |
| Cafeteria manager | `manager@secondserve.local` | `SecondServe@Manager123` | `/manager` |
| Organization administrator | `orgadmin@secondserve.local` | `SecondServe@Org123` | `/organization` |
| Super administrator | `admin@secondserve.local` | `SecondServe@Admin123` | `/admin` |

The login page has a demo-account picker. It fills the form; the user still signs in through real backend authentication.

```powershell
.\.venv\Scripts\python.exe -m backend.demo_seed
```

Seeding is safe to rerun. It checks accounts and deterministic analysis IDs, preserves existing passwords, and does not duplicate the 36 demo analyses. It creates:

- Second Serve Demo Organization and Green Plate Cafeteria.
- Main Campus, Hostel Dining, and Staff Cafeteria locations.
- All four roles and accounts; manager scope is assigned to the demo cafeteria.
- Configurable portions, food costs and **explicitly illustrative demo impact factors**.
- Synthetic before/after plates processed by the real image pipeline, across dates and meal types.
- Food-analysis rows, computed alerts and data-derived recommendation snapshots.

All seed analyses are `demo=true`. Normal analytics exclude them by default. The demo workspace explicitly enables the visible “Include labeled demo data” filter. Dashboard totals query the database; they are not separately hardcoded.

Create or promote a non-demo administrator interactively:

```powershell
.\.venv\Scripts\python.exe -m backend.seed --email you@example.com --role SUPER_ADMIN
```

The command prompts for a password. Public registration always creates a normal USER in a new personal workspace. Administrators provision additional accounts in their organization from **Administration → People**.

## What works

- Registration, Argon2id password hashing, signed HttpOnly session cookies, optional seven-day remembered sessions, password recovery, logout with server-side token-version invalidation.
- Backend RBAC: users see their analyses; managers see assigned-cafeteria locations; organization administrators see their organization; super administrators have system-wide analysis access.
- JPEG/PNG/WebP upload and camera capture input, image previews, replacement/removal, type/size/dimension checks and EXIF orientation normalization.
- Persisted processing jobs with real stage polling; interrupted jobs become explicit failures after restart.
- Plate ellipse fitting, normalized plate crops, ORB feature matching and bounded RANSAC homography where sufficient evidence exists.
- Pixel masks, region matching, calibrated area-based initial/remaining quantity estimates, confidence notes, detection/mask/difference/waste overlays.
- A full-width **on-image comparison drag button**: pointer capture, mouse, divider dragging, touch, pointer cancellation, keyboard arrows/Home/End, ARIA values, fixed image labels and interaction percentage. No bottom range control.
- The comparison percentage drives actual result quantities in the 3D representation. It never changes the saved measurements.
- Food labels, quantities, confidence, missed/false detections and polygon masks can be corrected; the original/corrected values and reviewer history are stored.
- Save-to-history, search/filter/sort/server-side pagination, food-level inspection and authenticated analysis images.
- Weighted and per-meal waste statistics, trends, food/meal/location/cafeteria breakdowns, cost estimates, sourced factor estimates, insufficient-data states and historical serving experiments.
- Threshold alerts, repeated/increasing waste signals and read state.
- Daily/weekly/monthly/custom reports; CSV, JSON and PDF downloads.
- Food, portion, cost and impact configuration; locations, cafeterias, members and roles; super-admin organization creation, model status, correction dataset exports and audit logs.
- Floating navigation, profile/logout menu, separate operational/admin views, dark/light themes, mobile layouts, reduced motion, performance mode and WebGL fallback.
- Lazy-loaded 3D plates, stylized food geometry, data particles, processing-state rings and measurement cues. Processing scenes are explicitly illustrative until a result exists.

## Architecture and files

```text
React UI → FastAPI → authentication / scope rules
                    → image pipeline → SQLAlchemy records
                    → corrections / analytics / reports → UI & 3D views

frontend/
  src/
    main.tsx              App routes, floating navigation, session context
    public.tsx            Landing, login, registration and recovery
    analysis.tsx          Capture, processing, results and mask review
    ImageComparison.tsx   On-image accessible pointer drag control
    Plate.tsx             Lazy-loaded R3F / Drei scene
    insights.tsx          Role dashboards, analytics, history and reports
    management.tsx        Settings and administration
    style.css             Theme tokens and responsive layouts
  tests/                  Playwright user journeys and role/drag tests
backend/
  main.py                 FastAPI routes and background processing
  models.py               Relational data model
  schemas.py              Strict request validation
  security.py             Password hashing, session verification and RBAC
  vision.py               CV, matching, masks and quantity calculations
  services.py             Scope, analytics, recommendations and alerts
  migrations/             Alembic migration, independent schema snapshot
  seed.py                 Secure interactive administrator provisioning
  demo_seed.py            Explicit idempotent local demo dataset
  tests/                  Backend integration and numerical tests
models/                   Optional trained-model setup notes
datasets/                 Correction export format notes
scripts/start.ps1         Windows setup and startup helper
data/                     Ignored local database, images, secret and mail
```

The schema includes User, Role, Organization, Cafeteria, Location, Food, MealAnalysis, FoodAnalysis, Correction, PortionConfig, FoodCost, ImpactFactor, Recommendation, Alert, Report, AuditLog, Upload and PasswordReset, with foreign keys and indexes. Corrections preserve provenance. Food archival preserves historical references; recorded costs and impact factors are snapshotted at review/seed time.

## Configuration

See `.env.example`. Set variables in the server environment; files are not silently loaded. To use an `.env` file, install `python-dotenv` and use Uvicorn’s `--env-file .env` option. Keep real secrets outside version control.

| Variable | Purpose |
|---|---|
| `DATA_DIR` | Local writable data directory; default `data` |
| `DATABASE_URL` | Optional SQLAlchemy URL; defaults to SQLite in DATA_DIR |
| `SECRET_KEY` | Session signing key, at least 32 random characters |
| `COOKIE_SECURE` | `true` for HTTPS deployment; `false` for local HTTP |
| `ALLOWED_ORIGINS` | Exact comma-separated browser origins |
| `APP_URL` | Browser origin used to build password-reset links |
| `YOLO_MODEL_PATH` | Optional trusted local trained segmentation checkpoint |
| `SMTP_HOST`, `SMTP_PORT` | Password-reset email delivery; STARTTLS |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | SMTP authentication/sender |

If `SECRET_KEY` is unset, local development generates a persistent random key at `data/.session-secret`. Back up/protect that directory. Password reset without SMTP writes a one-time, 30-minute link to **data/mail/** for local delivery; reset tokens are never returned in an API response.

The backend rejects unapproved request origins and cross-site mutations, uses SameSite cookies, validates role/tenant access on private image and data endpoints, limits auth attempts, limits uploads to 10 MB / 24 megapixels, strips original filenames/metadata, and returns generic unexpected-error responses.

Reports and date-range buckets use **UTC calendar dates** consistently. Timestamps are returned as UTC; the UI displays record times in the browser locale. Food cost currency is INR in this version.

## Database and migrations

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
```

Schema creation is explicit; application startup does not mutate the schema. The initial migration is a frozen schema definition. For future migrations, add revision files and run them before the server starts. Never downgrade a database containing work you need to preserve.

SQLite enables foreign keys and WAL. The models use PostgreSQL-compatible SQLAlchemy types. To use PostgreSQL, install `psycopg[binary]`, configure `DATABASE_URL=postgresql+psycopg://...`, and run migrations. PostgreSQL deployment is an architecture path; local verification was performed with SQLite.

## CV calibration and optional model

The capture form asks for **total initial serving grams**. Enter a weighed/known serving. The visible 500 g default is an assumption, not a measurement. Initial grams are allocated among before-image masks by area; remaining grams use matched after-area / before-area, capped at the initial serving. Remaining food is **potential plate waste**. Missing food is **inferred consumed**, not proven consumed.

Baseline limitations include pale food on pale plates, shadows, reflective/complex plates, mixed foods, food thickness changes, occlusion, added food, transferred food and unrelated images. Ellipse normalization and homography do not guarantee the same physical plate. Low-quality framing falls back explicitly to a center crop. Food names are not guessed from arbitrary colors. Quality scores are heuristic, not calibrated probabilities. Human review is part of the workflow.

For optional trained classification/segmentation, see `models/README.md`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-vision.txt
$env:YOLO_MODEL_PATH = 'C:\path\to\validated-food-segmentation.pt'
```

No trained checkpoint or licensed real-food dataset is bundled, and model accuracy is not claimed. The optional YOLO/PyTorch path has not been validated with a supplied checkpoint. A trusted local model is cached; predictions are serialized for safe shared-model use. Use representative held-out evaluation before operational decisions.

## Tests

Backend tests use a separate UUID-named SQLite database under `data/test-*` and do not modify the active application database:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
```

They cover registration/login/logout, password reset and revocation, role escalation prevention, tenant/manager scopes, food CRUD, invalid uploads, actual CV masks/quantities, save/analytics, corrections and audit trail, costs, alerts, reports, demo exclusion, recommendations and safe numerical calculations.

For browser tests, run the backend and Vite servers on ports 8000/5173, seed the demo workspace, and create the upload fixtures:

```powershell
.\.venv\Scripts\python.exe -m backend.demo_seed
.\.venv\Scripts\python.exe -c "from backend.vision import demo_images; from backend.db import DATA; demo_images(DATA/'browser-fixtures')"
cd frontend
npx.cmd playwright install chromium
npm.cmd test
npm.cmd run build
```

The browser suite exercises registration, login, processing, review, save, history, analytics, export, preferences, all seeded roles, logout/protected routes, real image uploads, keyboard/pointer/touch comparison, mobile overflow and desktop WebGL rendering. It creates test users/analyses in the running **local** app; never point it at production. Screenshots and failed traces are written to `frontend/test-results/`.

`frontend/package-lock.json` and `backend/requirements.lock.txt` record installed dependency versions. The lock file includes platform-specific packages from Windows; use the portable requirements file on Linux.

## API reference

Interactive API documentation: **http://127.0.0.1:8000/docs**. OpenAPI: `/openapi.json`.

Key endpoints include:

- `/api/auth/register`, `/login`, `/me`, `/logout`, `/forgot-password`, `/reset-password`
- `/api/analyze/upload`, `/api/analyze/meal`, `/api/analyze/demo`
- `/api/analysis/{id}`, `/api/analysis/{id}/save`, `/api/analysis/{id}/image/{kind}`
- `/api/feedback/correction`, `/api/history`
- `/api/analytics/all`, `/overview`, `/trends`, `/food-waste`, `/meal-time`, `/locations`, `/cafeterias`
- `/api/insights`, `/api/reports/daily`, `/weekly`, `/monthly`, `/export`
- `/api/foods`, `/api/locations`, `/api/cafeterias`, `/api/alerts`, `/api/settings`
- `/api/admin/users`, `/organizations`, `/audit`, `/corrections`, `/model`

Use the interactive docs for schemas, methods and validation constraints. Analytics default to saved, completed, non-demo analyses.

## Docker

```sh
docker compose up --build
# Optional local demonstration only:
docker compose exec secondserve python -m backend.demo_seed
```

Open http://localhost:8000. The application runs as a non-root container user, with a named data volume. Docker configuration is provided but requires Docker on the host; it is not a claim of a verified production deployment.

## Practical limits and next improvements

- This is a functional local application, not a claim of validated industrial food recognition or exact mass estimation.
- Background processing uses local FastAPI worker threads and persisted job state. Run a single API worker. A durable queue/worker service is needed for multi-instance production operation; startup marks interrupted jobs failed.
- Files are local, private, and tied to authenticated analyses. Production needs object storage, retention/backup policy, TLS, managed secrets, operational monitoring and a distributed rate limiter.
- Demo factors are explicitly fictional/configurable examples. Real environmental reporting needs verified factors appropriate to ingredient, region and lifecycle boundaries. The app does not label unmeasured food disappearance as “food saved.”
- Polygon correction updates overlays and dataset geometry. Quantity changes are explicit reviewer inputs; editing a boundary does not silently overwrite measured/reviewed quantities.
- Super-admin configuration screens display server model configuration; changing executable model paths requires a server environment change/restart. The UI does not upload executable checkpoints.
- Camera input depends on browser/device support. Small screens and Performance Mode use a labeled 2D portion fallback. 3D is supplementary to the numerical tables and images.
- Future accuracy work: calibrated plate/reference measurements, validated food models, robust instance tracking, measured depth/volume, held-out dataset evaluation and uncertainty calibration.
