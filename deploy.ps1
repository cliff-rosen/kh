# deploy.ps1 — Semantic-versioned deploy to production.
#
# Usage:
#   .\deploy.ps1              # Deploy everything (frontend + backend)
#   .\deploy.ps1 -Frontend    # Frontend only
#   .\deploy.ps1 -Backend     # Backend only
#   .\deploy.ps1 -SkipTag     # Deploy without creating a new version tag
#   .\deploy.ps1 -Force       # Override the main-branch check (use with caution)
#
# What it does:
#   1. Preflight: checks main branch, repo root, uncommitted changes
#   2. Version tag: reads latest v* tag, auto-increments patch, confirms, creates annotated tag, pushes
#   3. Frontend: writes VITE_APP_VERSION to .env.production, builds, syncs to S3
#   4. Backend: writes version to BUILD_VERSION, deploys to EB
#   5. Prints verification URLs

param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$SkipTag,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# If neither flag specified, deploy both
if (-not $Backend -and -not $Frontend) {
    $Backend = $true
    $Frontend = $true
}

# --- Config ---
$EB_ENV    = "knowledgehorizon-env"
$S3_BUCKET = "www.knowledgehorizon.ai"

# --- Preflight checks ---

# Must be at repo root
if (-not (Test-Path ".git")) {
    Write-Host "ERROR: Must run from the repository root." -ForegroundColor Red
    exit 1
}

# Must be on main branch
$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne "main" -and -not $Force) {
    Write-Host "ERROR: Deployments must be run from the 'main' branch (currently on '$branch')." -ForegroundColor Red
    Write-Host "  Merge your changes into main first, or use -Force to override." -ForegroundColor Yellow
    exit 1
}
if ($branch -ne "main" -and $Force) {
    Write-Host "WARNING: Deploying from '$branch' (not main). -Force was specified." -ForegroundColor Yellow
}

# Must have clean working tree
$dirty = git status --porcelain
if ($dirty) {
    Write-Host "ERROR: Working tree is dirty. Commit or stash changes before deploying." -ForegroundColor Red
    git status --short
    exit 1
}

# --- Version tagging ---
if (-not $SkipTag) {
    # Find latest v* tag
    $latestTag = $null
    try { $latestTag = git describe --tags --match "v*" --abbrev=0 2>$null } catch {}
    if ($latestTag) {
        # Parse version: v1.0.3 -> (1, 0, 3)
        $parts = $latestTag.TrimStart("v").Split(".")
        $major = [int]$parts[0]
        $minor = [int]$parts[1]
        $patch = [int]$parts[2]
        $nextVersion = "v$major.$minor.$($patch + 1)"
    } else {
        $nextVersion = "v1.0.0"
    }

    Write-Host ""
    Write-Host "=== Deploy to Production ===" -ForegroundColor Cyan
    Write-Host "  Current tag: $(if ($latestTag) { $latestTag } else { 'none' })" -ForegroundColor Gray
    Write-Host "  Next tag:    $nextVersion" -ForegroundColor Gray
    Write-Host "  Backend:     $Backend" -ForegroundColor Gray
    Write-Host "  Frontend:    $Frontend" -ForegroundColor Gray
    Write-Host ""

    $confirm = Read-Host "Deploy $nextVersion to PRODUCTION? Type 'yes' to confirm"
    if ($confirm -ne "yes") {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }

    # Create annotated tag
    Write-Host "Creating tag $nextVersion..." -ForegroundColor Yellow
    git tag -a $nextVersion -m "Release $nextVersion"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create tag" -ForegroundColor Red
        exit 1
    }

    # Push tag
    Write-Host "Pushing tag to origin..." -ForegroundColor Yellow
    git push origin $nextVersion
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Warning: failed to push tag (deploy will continue, tag is local only)" -ForegroundColor Yellow
    }

    $version = $nextVersion
} else {
    # SkipTag: use the latest existing tag
    $version = $null
    try { $version = git describe --tags --match "v*" --abbrev=0 2>$null } catch {}
    if (-not $version) {
        Write-Host "ERROR: No existing v* tag found. Run without -SkipTag first." -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "=== Deploy to Production (SkipTag) ===" -ForegroundColor Cyan
    Write-Host "  Version:   $version" -ForegroundColor Gray
    Write-Host "  Backend:   $Backend" -ForegroundColor Gray
    Write-Host "  Frontend:  $Frontend" -ForegroundColor Gray
    Write-Host ""

    $confirm = Read-Host "Deploy $version to PRODUCTION? Type 'yes' to confirm"
    if ($confirm -ne "yes") {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
}

# --- Deploy frontend ---
if ($Frontend) {
    Write-Host "Building frontend ($version)..." -ForegroundColor Yellow

    # Write version to .env.production
    "VITE_APP_VERSION=$version" | Out-File -FilePath "frontend/.env.production" -Encoding utf8 -NoNewline

    Push-Location frontend
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "Frontend build failed!" -ForegroundColor Red
        exit 1
    }

    Write-Host "Syncing to s3://$S3_BUCKET..." -ForegroundColor Yellow
    aws s3 sync dist/ "s3://$S3_BUCKET" --delete
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "Frontend deploy failed!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
    Write-Host "Frontend deployed." -ForegroundColor Green
}

# --- Deploy backend ---
if ($Backend) {
    Write-Host "Deploying backend ($version) to $EB_ENV..." -ForegroundColor Yellow

    # Write version to BUILD_VERSION file
    $version | Out-File -FilePath "backend/BUILD_VERSION" -Encoding utf8 -NoNewline

    Push-Location backend
    eb deploy $EB_ENV --label "$version"
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "Backend deploy failed!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
    Write-Host "Backend deployed." -ForegroundColor Green

    # Clean up BUILD_VERSION (it's not committed)
    Remove-Item "backend/BUILD_VERSION" -ErrorAction SilentlyContinue
}

# --- Done ---
Write-Host ""
Write-Host "=== Deploy Complete ===" -ForegroundColor Green
Write-Host "  Version:  $version" -ForegroundColor Gray
Write-Host ""
Write-Host "Verify:" -ForegroundColor Cyan
if ($Backend) {
    Write-Host "  curl https://api.knowledgehorizon.ai/api/health" -ForegroundColor Gray
}
if ($Frontend) {
    Write-Host "  https://www.knowledgehorizon.ai" -ForegroundColor Gray
}
Write-Host ""
