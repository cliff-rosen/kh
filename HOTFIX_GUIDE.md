# Hotfix Guide: Patching Production (v1.0.1)

You have uncommitted work on `main` and need to fix a bug on the production release `v1.0.1`.

---

## Step 1: Stash your current work

```bash
# See what you have in-flight
git status

# Stash everything, including untracked files
git stash push -u -m "WIP: main branch work before hotfix"

# Verify working tree is clean
git status
```

> `-u` includes untracked files (your new files like `collections.py`, `tags.py`, etc.)

---

## Step 2: Create a hotfix branch from v1.0.1

```bash
# Create and switch to a hotfix branch based on the tag
git checkout -b hotfix/1.0.2 v1.0.1
```

This gives you a branch rooted at the exact production code (`8d25e4e`).

---

## Step 3: Make your fix

Edit whatever files need fixing, then:

```bash
# Stage and commit the fix
git add <fixed-files>
git commit -m "fix: <describe the bug fix>"
```

---

## Step 4: Tag the new release

```bash
git tag v1.0.2
```

---

## Step 5: Deploy the hotfix

```bash
# Push the hotfix branch and tag to remote
git push origin hotfix/1.0.2
git push origin v1.0.2
```

Deploy `v1.0.2` to production however you normally do.

---

## Step 6: Merge the fix back into main

```bash
git checkout main
git merge hotfix/1.0.2
```

If there are conflicts, resolve them — your `main` work hasn't been restored yet, so conflicts will only be between the hotfix and existing `main` commits.

---

## Step 7: Restore your stashed work

```bash
# See your stashes
git stash list

# Restore your WIP
git stash pop
```

If `stash pop` produces conflicts, resolve them, then `git add` the resolved files.

---

## Quick Reference

| Step | Command |
|------|---------|
| Stash work | `git stash push -u -m "WIP: main branch work before hotfix"` |
| Create hotfix branch | `git checkout -b hotfix/1.0.2 v1.0.1` |
| Fix & commit | `git add ... && git commit -m "fix: ..."` |
| Tag release | `git tag v1.0.2` |
| Push | `git push origin hotfix/1.0.2 && git push origin v1.0.2` |
| Return to main | `git checkout main && git merge hotfix/1.0.2` |
| Restore stash | `git stash pop` |
