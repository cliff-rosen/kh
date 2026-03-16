# Branching Strategy

## Branch Structure

```
main (production)
  │
  v1.0.0 ── v1.0.1 ── v1.0.2 ── (future releases)
                                    ↑
                                    │ merge when ready to release
                                    │
develop (daily work)
  │
  ├── feature/foo
  ├── feature/bar
  └── all development happens here
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

## Workflows

### Normal Development

```bash
git checkout develop
git checkout -b feature/my-feature
# ... work ...
git checkout develop
git merge feature/my-feature
git branch -d feature/my-feature
```

### Releasing to Production

```bash
git checkout main
git merge develop
git tag v1.X.0
git push origin main
git push origin v1.X.0
# deploy v1.X.0 to production
```

### Hotfixing Production

```bash
# 1. Stash any in-progress work
git stash push -u -m "WIP: work before hotfix"

# 2. Create hotfix branch from the production tag
git checkout -b hotfix/1.X.Y vCURRENT

# 3. Fix, commit, tag
git add <fixed-files>
git commit -m "fix: describe the bug fix"
git tag v1.X.Y

# 4. Push
git push origin hotfix/1.X.Y
git push origin v1.X.Y

# 5. Merge into main
git checkout main
git merge hotfix/1.X.Y
git push origin main

# 6. Merge into develop (so the fix isn't lost)
git checkout develop
git merge hotfix/1.X.Y
git push origin develop

# 7. Clean up
git branch -d hotfix/1.X.Y
git push origin --delete hotfix/1.X.Y

# 8. Restore stashed work
git stash pop
```

## Tagging Convention

- All production releases are tagged: `v1.0.0`, `v1.0.1`, `v1.0.2`, etc.
- Tags are permanent markers — never delete or move them.
- Hotfix branches are temporary — the tag is the permanent record.

## Rules

1. **Never commit directly to `main`** — it only receives merges.
2. **Never force-push `main`** (except during one-time setup, documented below).
3. **All dev work starts from `develop`.**
4. **Hotfixes always merge into both `main` and `develop`** so the fix isn't lost.
5. **Delete short-lived branches after merging** — tags and merge commits preserve history.

---

## Appendix: Initial Setup (March 2026)

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
