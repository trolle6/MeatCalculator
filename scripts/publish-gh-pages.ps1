# Manual GitHub Pages publish (when Actions is not running).
# Builds _site from wwwroot + API JSON, pushes to gh-pages branch.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$proj = Join-Path $root "meat calculator\meat calculator.csproj"
$www = Join-Path $root "meat calculator\wwwroot"
$site = Join-Path $root "_site_publish"

Write-Host "Building Release..."
dotnet build $proj -c Release | Out-Host
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (Test-Path $site) { Remove-Item -Recurse -Force $site }
New-Item -ItemType Directory -Path (Join-Path $site "api\rest") -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $site ".nojekyll") -Force | Out-Null

Write-Host "Copying wwwroot..."
& robocopy $www $site /E /XD ux-lab pull-slip /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }

Write-Host "Starting API for JSON export..."
$projDir = Split-Path $proj -Parent
$proc = Start-Process -FilePath "dotnet" -ArgumentList @(
  "run", "-c", "Release", "--no-build", "--urls", "http://127.0.0.1:5050"
) -WorkingDirectory $projDir -PassThru -WindowStyle Hidden

$ready = $false
for ($i = 0; $i -lt 45; $i++) {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:5050/api/data" -UseBasicParsing -TimeoutSec 3 | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}
if (-not $ready) {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  throw "API did not start on :5050"
}

$exports = @(
  @{ Path = "api/data.json"; Uri = "/api/data" },
  @{ Path = "api/timeline.json"; Uri = "/api/timeline" },
  @{ Path = "api/science.json"; Uri = "/api/science" },
  @{ Path = "api/recipes.json"; Uri = "/api/recipes" },
  @{ Path = "api/guide.json"; Uri = "/api/guide" },
  @{ Path = "api/profiles.json"; Uri = "/api/profiles" },
  @{ Path = "api/sources.json"; Uri = "/api/sources" },
  @{ Path = "api/rest/environments.json"; Uri = "/api/rest/environments" }
)
foreach ($e in $exports) {
  $out = Join-Path $site $e.Path
  $dir = Split-Path $out -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Invoke-WebRequest -Uri "http://127.0.0.1:5050$($e.Uri)" -OutFile $out -UseBasicParsing
}

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$html = Get-Content (Join-Path $site "index.html") -Raw
if ($html -notmatch "pullTempBadge") { throw "Missing pullTempBadge in index.html" }
if ($html -notmatch "brand-home") { throw "Missing brand-home in index.html" }
$buildMatch = [regex]::Match($html, 'smoke-lab-build" content="(\d+)"')
if (-not $buildMatch.Success) { throw "Missing smoke-lab-build" }
$build = $buildMatch.Groups[1].Value
Write-Host "Bundle OK (build $build)"

$worktree = Join-Path $root ".gh-pages-deploy"
Push-Location $root
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
git fetch origin gh-pages 2>&1 | Out-Host
$ErrorActionPreference = $prevEap
if (Test-Path $worktree) {
  git worktree remove $worktree --force 2>$null
  Remove-Item -Recurse -Force $worktree -ErrorAction SilentlyContinue
}
git worktree add -B gh-pages $worktree origin/gh-pages
if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

Get-ChildItem $worktree -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $site "*") -Destination $worktree -Recurse -Force

Push-Location $worktree
git add -A
$sha = (git -C $root rev-parse --short HEAD)
git commit -m "deploy: manual publish from main@$sha (build $build)"
git push origin gh-pages
Pop-Location
Pop-Location

Write-Host "Published to gh-pages. Live site updates in 1-3 minutes."
Write-Host "Check: https://trolle6.github.io/SmokeLab/ (view source for smoke-lab-build $build)"
