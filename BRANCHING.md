# Branching & Deployment Specification

A standalone guide for teams using a **main/develop** branching model with semantic version tagging and scripted production deploys.

---

## 1. Branch Structure

```
main (production)
  |
  v1.0.0 -- v1.0.1 -- v1.0.2 -- (future releases)
                                   ^
                                   | merge when ready to release
                                   |
develop (daily work)
  |
  +-- feature/foo
  +-- feature/bar
  +-- all development happens here
```

### Long-Lived Branches

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Always matches production. Only moves forward via release merges or hotfixes. | Production |
| `develop` | Active development. All day-to-day work happens here. | Staging (if applicable) |

### Short-Lived Branches

| Branch | Created from | Merges into | Then |
|--------|-------------|-------------|------|
| `feature/*` | `develop` | `develop` | Delete branch |
| `hotfix/*` | `main` (or a version tag) | `main` AND `develop` | Tag on main, delete branch |

---

## 2. Rules

1. **Never commit directly to `main`** -- it only receives merges.
2. **Never force-push `main`.**
3. **All dev work starts from `develop`.**
4. **Hotfixes always merge into both `main` and `develop`** so the fix is not lost.
5. **Delete short-lived branches after merging** -- tags and merge commits preserve history.

---

## 3. Tagging Convention

- All production releases are tagged: `v1.0.0`, `v1.0.1`, `v1.0.2`, etc.
- Patch version auto-increments on each deploy (handled by the deploy script).
- Tags are permanent markers -- never delete or move them.
- Hotfix branches are temporary -- the tag is the permanent record.

---

## 4. Workflows

### 4.1 Normal Development

```bash
git checkout develop
git checkout -b feature/my-feature
# ... work, commit ...
git checkout develop
git merge feature/my-feature
git branch -d feature/my-feature
```

When pushing a new local branch for the first time, set the upstream:

```bash
git push -u origin feature/my-feature
```

After the first push, plain `git push` works for that branch.

### 4.2 Releasing to Production

When `develop` is ready to ship:

```bash
# 1. Switch to main and merge develop
git checkout main
git merge develop

# 2. Deploy (your deploy script handles tagging, building, and pushing to production)
./deploy.sh                # Deploy everything
./deploy.sh --frontend     # Frontend only
./deploy.sh --backend      # Backend only
./deploy.sh --skip-tag     # Re-deploy current version without a new tag

# 3. Push main so the remote matches
git push origin main

# 4. Return to develop and sync
git checkout develop
git merge main             # Keep develop up-to-date with the release tag commit
git push origin develop
```

### 4.3 Hotfixing Production

When a bug is found in production and `develop` has unreleased work:

```bash
# 1. Stash any in-progress work
git stash push -u -m "WIP: work before hotfix"

# 2. Create hotfix branch from the current production tag
git checkout main
git checkout -b hotfix/X.Y.Z

# 3. Fix and commit
git add <fixed-files>
git commit -m "fix: describe the bug fix"

# 4. Push the hotfix branch (first push needs -u)
git push -u origin hotfix/X.Y.Z

# 5. Merge into main and deploy
git checkout main
git merge hotfix/X.Y.Z
./deploy.sh

# 6. Push main
git push origin main

# 7. Merge into develop so the fix is not lost
git checkout develop
git merge main
git push origin develop

# 8. Clean up
git branch -d hotfix/X.Y.Z
git push origin --delete hotfix/X.Y.Z

# 9. Restore stashed work
git stash pop
```

---

## 5. Health Check Endpoint

Every project must expose a health check endpoint that reports application status, database connectivity, and the running version.

### Endpoint

```
GET /api/health
```

### Response

```json
{
  "status": "healthy",
  "version": "v1.0.3",
  "database": "healthy"
}
```

If the database is unreachable:

```json
{
  "status": "degraded",
  "version": "v1.0.3",
  "database": "unhealthy",
  "database_error": "Connection refused"
}
```

### Response Fields

| Field | Value | Meaning |
|-------|-------|---------|
| `status` | `"healthy"` | All checks pass |
| `status` | `"degraded"` | App is running but a dependency (e.g., database) is down |
| `version` | `"v1.0.3"` | The resolved application version (see Section 7) |
| `database` | `"healthy"` / `"unhealthy"` | Result of a simple connectivity check |
| `database_error` | _(string, optional)_ | Only present when `database` is `"unhealthy"` |

### Implementation Requirements

1. **Database check** -- execute a trivial query (e.g., `SELECT 1`) against the primary database. Catch all exceptions; never let the health endpoint itself crash.
2. **Version** -- return the resolved version from the backend version resolution logic (see Section 7).
3. **Overall status** -- `"healthy"` if all checks pass, `"degraded"` if any check fails. The endpoint should still return HTTP 200 even when degraded, so load balancers and monitoring can distinguish "app is up but a dependency is down" from "app is down."

### Reference Implementation (Python / FastAPI)

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

router = APIRouter()

@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_async_db)):
    db_status = "healthy"
    db_error = None
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = "unhealthy"
        db_error = str(e)

    overall = "healthy" if db_status == "healthy" else "degraded"

    result = {
        "status": overall,
        "version": settings.APP_VERSION,
        "database": db_status,
    }
    if db_error:
        result["database_error"] = db_error

    return result
```

---

## 6. Deploy Script Requirements

The deploy script (e.g., `deploy.sh` or `deploy.ps1`) must enforce the following:

### Preflight Checks

1. **Branch check** -- refuse to deploy if not on `main` (optionally allow a `--force` flag to override).
2. **Clean working tree** -- refuse to deploy if there are uncommitted changes.
3. **Repository root** -- refuse to deploy if not run from the repo root.

### Version Tagging

1. Read the latest `v*` tag.
2. Auto-increment the patch version (e.g., `v1.0.2` -> `v1.0.3`).
3. Confirm with the user before proceeding.
4. Create an annotated git tag and push it to origin.

### Build & Deploy

1. **Frontend** -- build the frontend with the version injected (e.g., as an environment variable), then deploy to your hosting provider.
2. **Backend** -- write the version to a `BUILD_VERSION` file (not committed to git), then deploy to your hosting provider.

### GitHub Release

1. Push the version tag to origin (if not already pushed during tagging).
2. Create a GitHub Release using `gh release create <tag> --generate-notes`.
3. Optionally allow the deployer to provide custom release notes instead of auto-generated ones.

### Cleanup

1. Remove the `BUILD_VERSION` file (it should not be committed).
2. Print verification URLs so the deployer can confirm the deploy succeeded.

---

## 7. Version Tracking and Auto-Update Detection

This section defines a complete version tracking system spanning the deploy script, backend, and frontend. The goal: users are automatically notified when a new version is deployed and can update with one click.

### 7.1 Backend Version Resolution

The backend resolves its version at startup using a three-tier fallback:

| Priority | Source | When it exists |
|----------|--------|----------------|
| 1 | `BUILD_VERSION` file | Written by deploy script, deployed to production, **never committed to git** |
| 2 | Latest `v*` git tag | Available in local dev environments that have tags |
| 3 | `"dev"` | Default when neither of the above exists |

The resolved version is set once at startup and returned by the health endpoint (Section 5).

#### Reference Implementation (Python)

```python
from pathlib import Path
import subprocess

def _resolve_version() -> str:
    """Read version from BUILD_VERSION file, git tag, or fall back to 'dev'."""
    backend_dir = Path(__file__).resolve().parent.parent

    # 1. BUILD_VERSION file (written by deploy script)
    build_file = backend_dir / "BUILD_VERSION"
    if build_file.exists():
        version = build_file.read_text().strip()
        if version:
            return version

    # 2. Latest git tag
    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--match", "v*", "--abbrev=0"],
            capture_output=True, text=True, cwd=str(backend_dir), timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass

    # 3. Default
    return "dev"
```

### 7.2 Frontend Version Injection

The deploy script writes the version into the frontend build:

1. **At deploy time**, the deploy script writes the version to a build-time environment variable (e.g., `VITE_APP_VERSION=v1.0.3` in `.env.production` for Vite projects).
2. **At build time**, the bundler bakes this value into the JavaScript bundle.
3. **At runtime**, the frontend reads it (e.g., `import.meta.env.VITE_APP_VERSION`).

This means the frontend's version is frozen at build time -- it reflects the version that was deployed when the user last loaded the page.

### 7.3 Auto-Update Detection

The frontend polls the backend health endpoint and compares versions. When the backend reports a newer version than what the frontend was built with, the user is prompted to refresh.

#### How It Works

1. **Poll interval**: every 60 seconds (production only; disabled in dev).
2. **Comparison**: frontend build version vs. `version` field from `GET /api/health`.
3. **Trigger**: if the two versions differ and neither is `"dev"`, set a `newVersionAvailable` flag.
4. **Errors**: silently ignored -- network failures should never disrupt the app.

#### Reference Implementation (React / TypeScript)

**Hook: `useVersionCheck.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL_MS = 60_000;

interface VersionCheckResult {
  newVersionAvailable: boolean;
  latestVersion: string;
}

export function useVersionCheck(): VersionCheckResult {
  const [latestVersion, setLatestVersion] = useState('');
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);

  // Read the version baked into the frontend at build time
  const buildVersion = import.meta.env.VITE_APP_VERSION;
  const isProduction = buildVersion && buildVersion !== 'dev';

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) return;
      const data = await res.json();
      const serverVersion = data.version;
      if (serverVersion && serverVersion !== 'dev') {
        setLatestVersion(serverVersion);
        if (buildVersion && serverVersion !== buildVersion) {
          setNewVersionAvailable(true);
        }
      }
    } catch {
      // Silently ignore -- network errors shouldn't disrupt the app
    }
  }, [buildVersion]);

  useEffect(() => {
    if (!isProduction) return;
    checkVersion();
    const interval = setInterval(checkVersion, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isProduction, checkVersion]);

  return { newVersionAvailable, latestVersion };
}
```

**Component: `VersionBanner.tsx`**

```tsx
import { useVersionCheck } from '../hooks/useVersionCheck';

export default function VersionBanner() {
  const { newVersionAvailable, latestVersion } = useVersionCheck();

  if (!newVersionAvailable) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600
                    text-white text-center py-2 text-sm">
      A new version ({latestVersion}) is available.{' '}
      <button
        onClick={() => window.location.reload()}
        className="underline font-semibold hover:text-blue-100"
      >
        Refresh now
      </button>
    </div>
  );
}
```

**Integration**: render `<VersionBanner />` at the root of your app (e.g., inside `<BrowserRouter>` but before route definitions) so it appears on every page.

### 7.4 Version Display in the UI

Display the frontend and backend versions somewhere accessible to users (e.g., user profile page, settings page, or app footer). This helps with support and debugging -- when a user reports an issue, you can immediately ask "what version do you see?"

| Field | Source | How to read it |
|-------|--------|----------------|
| Frontend version | Build-time env var | `import.meta.env.VITE_APP_VERSION \|\| 'dev'` |
| Backend version | Health endpoint | Fetch `GET /api/health` on page load, read `.version` |

#### Reference Implementation (React / TypeScript)

On your profile or settings page, fetch the backend version on mount and display both:

```typescript
const [backendVersion, setBackendVersion] = useState<string>('...');

useEffect(() => {
  fetch('/api/health')
    .then(res => res.json())
    .then(data => setBackendVersion(data.version))
    .catch(() => setBackendVersion('?'));
}, []);
```

```tsx
<dl>
  <div className="flex justify-between">
    <dt className="text-gray-500">Frontend</dt>
    <dd className="font-mono text-xs">
      {import.meta.env.VITE_APP_VERSION || 'dev'}
    </dd>
  </div>
  <div className="flex justify-between">
    <dt className="text-gray-500">Backend</dt>
    <dd className="font-mono text-xs">
      {backendVersion}
    </dd>
  </div>
</dl>
```

Use monospace (`font-mono`) and small text (`text-xs`) so the version strings are clearly distinct from regular content. The `'...'` initial state gives the user feedback that the backend version is loading; `'?'` indicates a fetch failure.

### 7.5 How the Pieces Connect

```
Deploy Script
  |
  +-- writes BUILD_VERSION file --> deployed with backend
  +-- writes VITE_APP_VERSION  --> baked into frontend build
  |
Backend (at startup)
  |
  +-- reads BUILD_VERSION --> serves via GET /api/health { version: "v1.0.4" }
  |
Frontend (at runtime)
  |
  +-- knows its own version: VITE_APP_VERSION = "v1.0.3" (from last build)
  +-- polls /api/health every 60s
  +-- "v1.0.4" != "v1.0.3" --> shows banner: "New version available. Refresh now"
  +-- user clicks refresh --> loads new frontend bundle with "v1.0.4"
```

---

## 8. Release Notes via GitHub Releases

Every production deploy must have release notes attached to its version tag as a **GitHub Release**. This creates a permanent, browsable record of what changed in each version.

### Why GitHub Releases (not just tags)

- **Tags** are lightweight git pointers -- they have no UI for release notes, changelogs, or discussion.
- **GitHub Releases** are built on top of tags and provide a dedicated page per version with markdown notes, auto-generated changelogs from commits/PRs, and a prominent "Releases" section on the repo.

### Workflow

The deploy script should create the GitHub Release automatically after tagging and deploying. Use the GitHub CLI (`gh`):

```bash
# Auto-generate release notes from commit messages and merged PRs since the last tag
gh release create v1.0.3 --generate-notes

# Or provide a title and custom notes
gh release create v1.0.3 \
  --title "v1.0.3" \
  --notes "$(cat <<'EOF'
## What changed
- Fixed session timeout on long-running exports
- Added bulk delete for archived records

## Notes
- Database migration required (see migration script)
EOF
)"

# For hotfixes, mark as a patch
gh release create v1.0.3 \
  --title "v1.0.3 (hotfix)" \
  --generate-notes
```

### Deploy Script Integration

Add the GitHub Release step after tagging and deploying:

```
Preflight checks
  -> Version tag (git tag)
  -> Build & deploy
  -> Create GitHub Release (gh release create)
  -> Cleanup
```

The `--generate-notes` flag auto-generates a changelog from:
- Merged pull request titles (grouped by label if configured)
- Commit messages for direct commits
- A "New Contributors" section for first-time contributors

This is the recommended default. Teams can supplement or replace the auto-generated notes with custom content when needed (e.g., for major releases or breaking changes).

### Requirements

- The GitHub CLI (`gh`) must be installed and authenticated on the machine running the deploy script.
- The repo must be hosted on GitHub.
- The tag must be pushed to origin before `gh release create` is called.

### Release Notes Convention

For manually written notes, use this structure:

```markdown
## What changed
- [Brief description of each change]

## Bug fixes
- [Brief description of each fix]

## Breaking changes
- [If any -- describe what breaks and how to migrate]

## Notes
- [Migration steps, known issues, or other callouts]
```

---

## 9. Database Schema Changes

Schema changes happen ad-hoc during development against the **dev database**. Before deploying to production, those changes must be applied to the **production database**.

### Before a Production Deploy

1. **Compare schemas** -- dump both the dev and production schemas and diff them.
2. **Generate migration statements** -- identify every difference and create the `ALTER TABLE` / `CREATE TABLE` statements needed to bring production in line with dev.
3. **Apply to production** -- run the migration statements against the production database.
4. **Deploy the code.**
5. **Verify** -- re-dump both schemas and confirm they match.

### Environment Targeting

Use an environment variable (e.g., `ENVIRONMENT`) to control which database your tools connect to:

| `ENVIRONMENT` value | Connects to |
|---------------------|-------------|
| _(not set)_ | Dev database (safe default) |
| `production` | Production database |

**Always unset `ENVIRONMENT` when done working with production.**

---

## 10. Deployment Policy

Use **immutable deployments** (or equivalent zero-downtime strategy) for production:

- New instances are launched alongside old ones.
- Traffic only switches after health checks pass on the new instances.
- Automatic rollback if the new version fails health checks.

---

## 11. Initial Setup for New Projects

To adopt this model on a project that currently uses a single branch:

1. Ensure all in-progress work on `main` is committed and pushed.
2. Create `develop` from `main` HEAD:
   ```bash
   git branch develop main
   ```
3. If `main` has unreleased commits beyond the current production state, reset it to the production tag:
   ```bash
   git reset --hard vCURRENT
   git push origin main --force   # One-time only -- document this
   ```
4. Push `develop`:
   ```bash
   git push -u origin develop
   ```
5. Set `develop` as the default branch in your repository settings (GitHub/GitLab).
6. Document the migration (commit hash, date, who performed it) for audit purposes.

After setup:
- `main` points to the current production release.
- `develop` contains all development work.
- All team members switch their working branch to `develop`.

---

## Appendix: Knowledge Horizon Initial Setup (March 2026)

This section documents the one-time migration from a single-branch workflow to the main/develop model. Retained for audit purposes.

### Prior State

- All work (production releases and active development) lived on a single `main` branch.
- Production releases were tracked via tags: `v1.0.0`, `v1.0.1`.
- No separation between released and unreleased code on `main`.

### Trigger: Hotfix v1.0.2

A bug was discovered in production (v1.0.1). The hotfix process exposed the need for a proper branching model:

1. Stashed uncommitted work on `main`:
   ```
   git stash push -u -m "WIP: main branch work before hotfix"
   ```
2. Created hotfix branch from v1.0.1 tag:
   ```
   git checkout -b hotfix/1.0.2 v1.0.1
   ```
3. Applied fix (`fix: New chat will now stick after refresh`), tagged as `v1.0.2`, pushed.
4. Merged hotfix back into `main`, restored stash.

At this point `main` contained: v1.0.1 → 14 unreleased dev commits → hotfix merge → restored WIP. Production was v1.0.2.

### Migration to main/develop

Executed on 2026-03-14:

1. Committed all in-progress work on `main`.
2. Pushed `main` to remote to ensure nothing was lost.
3. Created `develop` branch from `main` HEAD — capturing all dev work and the hotfix merge:
   ```
   git branch develop main
   ```
4. Reset `main` back to the production release:
   ```
   git reset --hard v1.0.2
   git push origin main --force
   ```
5. Pushed `develop` to remote:
   ```
   git push -u origin develop
   ```
6. Deleted the `hotfix/1.0.2` branch (local and remote) — the `v1.0.2` tag is the permanent record.

### Result

| Branch | Points to | Contains |
|--------|-----------|----------|
| `main` | `b44632a` (v1.0.2) | Production code only |
| `develop` | `326b62c` | All dev work + hotfix merge |

| Tag | Commit | Description |
|-----|--------|-------------|
| `v1.0.0` | (initial) | First production release |
| `v1.0.1` | `8d25e4e` | Second production release |
| `v1.0.2` | `b44632a` | Hotfix: New chat will now stick after refresh |
