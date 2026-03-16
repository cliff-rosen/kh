# Deployment Guide

## 1. Environments

| Component | Production | Local Dev |
|-----------|-----------|-----------|
| **Backend** | EB: `knowledgehorizon-env` | `localhost:8000` |
| **Frontend** | S3: `www.knowledgehorizon.ai` | `localhost:5173` |
| **Database** | MariaDB: `kh2` (RDS `us-east-2`) | MariaDB: `khdev` |
| **API URL** | `https://api.knowledgehorizon.ai` | `http://localhost:8000` |
| **Frontend URL** | `https://www.knowledgehorizon.ai` | `http://localhost:5173` |

EB application: `knowledgehorizon-app` | Region: `us-east-1` | Platform: Python 3.11 on Amazon Linux 2023

---

## 2. Configuration

### Backend

`backend/config/settings.py` selects a `.env` file based on the `ENVIRONMENT` env var:

| `ENVIRONMENT` | Loads | Database | Safe? |
|---------------|-------|----------|-------|
| _(not set)_ | `.env` | `khdev` | Default — safe |
| `production` | `.env.production` | `kh2` | Must be explicit |

On EB, `ENVIRONMENT` is set once via `eb setenv` and persists across all deploys. Locally it's never set, so you always get `khdev`.

### Version tracking

The backend version is resolved at startup:

1. **`BUILD_VERSION` file** — written by `deploy.ps1`, deployed to EB, not committed to git
2. **Latest `v*` git tag** — fallback for local dev with tags
3. **`"dev"`** — default when neither exists

The `/api/health` endpoint returns `{ "status": "healthy", "version": "<version>" }`.

### Frontend

`frontend/src/config/settings.ts` selects the API URL based on Vite's build mode (`import.meta.env.MODE`):

| Build mode | API URL | Set by |
|------------|---------|--------|
| `development` | `localhost:8000` | `npm run dev` |
| `production` | `api.knowledgehorizon.ai` | `npm run build` |

The deploy script writes `VITE_APP_VERSION=v1.0.X` to `frontend/.env.production` before building. The frontend polls `/api/health` every 60 seconds and shows a blue banner when a newer version is detected.

### Config files

| File | Purpose | Deployed to EB? | In git? |
|------|---------|-----------------|---------|
| `backend/.env` | Dev config | No | No |
| `backend/.env.production` | Prod config | Yes | No |
| `backend/BUILD_VERSION` | Deploy version | Yes | No |
| `backend/.ebignore` | EB deploy exclusions | N/A | Yes |

---

## 3. Branching Model

This project uses a **main/develop** branching model. See `BRANCHING.md` for full details.

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Always matches production. Only moves forward via release merges or hotfixes. | **Production** |
| `develop` | Active development. All day-to-day work happens here. | Local dev only |

**Key rule:** Production deployments ONLY happen from the `main` branch. The deploy script enforces this.

---

## 4. Deploying

### Local Dev

```bash
# Backend
cd backend && venv/Scripts/python.exe -m uvicorn main:app --reload

# Frontend
cd frontend && npm run dev
```

### Production — Release

When `develop` is ready to ship:

```bash
# 1. Switch to main and merge develop
git checkout main
git merge develop

# 2. Deploy (tags, builds, and pushes to production)
.\deploy.ps1              # Deploy everything (frontend + backend)
.\deploy.ps1 -Frontend    # Frontend only
.\deploy.ps1 -Backend     # Backend only
.\deploy.ps1 -SkipTag     # Re-deploy current version without a new tag

# 3. Push main so the remote matches
git push origin main

# 4. Return to develop
git checkout develop
git merge main            # Keep develop up-to-date with the release tag commit
git push origin develop
```

### Production — Hotfix

When a bug is found in production and `develop` has unreleased work:

```bash
# 1. Create hotfix branch from the current production tag
git checkout main
git checkout -b hotfix/X.Y.Z

# 2. Fix, commit
git add <fixed-files>
git commit -m "fix: describe the bug fix"

# 3. Merge into main and deploy
git checkout main
git merge hotfix/X.Y.Z
.\deploy.ps1

# 4. Push main
git push origin main

# 5. Merge into develop so the fix isn't lost
git checkout develop
git merge main
git push origin develop

# 6. Clean up
git branch -d hotfix/X.Y.Z
```

### What `deploy.ps1` does

1. **Preflight** — refuses to deploy if not on `main`, working tree is dirty, or not at repo root (use `-Force` to override the branch check)
2. **Version tag** — reads latest `v*` tag, auto-increments patch, confirms with user, creates annotated tag, pushes to origin
3. **Frontend** — writes `VITE_APP_VERSION` to `.env.production`, builds, syncs to S3
4. **Backend** — writes version to `BUILD_VERSION`, deploys to EB via `eb deploy`
5. **Cleanup** — removes `BUILD_VERSION` (not committed), prints verification URLs

### Deployment policy

Backend uses **immutable deployments** (configured in `.ebextensions/deployment.config`). This ensures:
- Zero-downtime deploys
- Automatic rollback if the new version fails health checks
- New instances are launched alongside old ones, traffic only switches after health check passes

### Verifying a deploy

```bash
# Backend version
curl https://api.knowledgehorizon.ai/api/health

# Frontend — check the browser; if a new version is available, a blue banner appears
```

---

## 5. Database Schema Changes

Schema changes happen ad-hoc during development against `khdev`. Before deploying to production, those changes must be applied to `kh2`.

### Before a production deploy

**Compare schemas:**
```bash
cd backend
venv/Scripts/python.exe migrations/dump_schemas.py
```

This outputs `migrations/schema_khdev.sql` and `migrations/schema_kh2.sql`.

**Find differences:** Send both files to an LLM and ask it to report every difference and generate the ALTER/CREATE statements needed to bring `kh2` in line with `khdev`.

**Apply changes to `kh2`:**
```bash
set ENVIRONMENT=production
venv/Scripts/python.exe -c "
from database import async_engine
from sqlalchemy import text
import asyncio
async def run():
    async with async_engine.begin() as conn:
        await conn.execute(text('ALTER TABLE ...'))
        print('Done')
asyncio.run(run())
"
set ENVIRONMENT=
```

Or connect to `kh2` directly via MySQL Workbench.

**Deploy the code**, then re-run `dump_schemas.py` to verify the schemas match.

### How `ENVIRONMENT` targets a database from your local machine

Any script that imports from `database.py` connects to whatever `ENVIRONMENT` resolves to:

- `ENVIRONMENT` not set → `khdev`
- `ENVIRONMENT=production` → `kh2`

Always unset `ENVIRONMENT` when done.
