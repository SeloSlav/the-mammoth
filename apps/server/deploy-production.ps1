# Fast production database deployment script
# Updates existing database without deleting
# Run from repo root: npm run deploy:prod

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$modulePath = $scriptDir
$repoRoot = Split-Path -Parent $scriptDir
$outDir = [System.IO.Path]::GetFullPath((Join-Path $scriptDir "..\client\src\module_bindings"))

function Assert-LastExit([string]$stepName) {
  if ($LASTEXITCODE -ne 0) {
    throw "[ERROR] $stepName failed with exit code $LASTEXITCODE."
  }
}

Set-Location $modulePath

Write-Host "[BUILD] Building and deploying to production database..." -ForegroundColor Yellow
spacetime publish --no-config --server maincloud -p . the-mammoth -y
Assert-LastExit "Publish to maincloud"

Write-Host "[GEN] Regenerating client bindings..." -ForegroundColor Yellow
spacetime generate --no-config --include-private -p . -l typescript -o "$outDir" -y
Assert-LastExit "Generate TypeScript bindings"

Write-Host "[GIT] Committing and pushing to trigger deployment..." -ForegroundColor Yellow
Set-Location $repoRoot
git add .
Assert-LastExit "git add"

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "Deploy: Database update with latest changes"
  Assert-LastExit "git commit"
} else {
  Write-Host "[GIT] No staged changes to commit; skipping commit." -ForegroundColor DarkYellow
}

git push
Assert-LastExit "git push"

Write-Host "[SUCCESS] Production deployment complete!" -ForegroundColor Green
Write-Host "[DB] Database: the-mammoth on maincloud" -ForegroundColor Cyan
Write-Host "[INFO] Database was updated (not wiped)" -ForegroundColor Blue
