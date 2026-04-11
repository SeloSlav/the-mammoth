# Fast production database deployment script - CLEAN VERSION
# Deletes database first for completely fresh start
# Run from repo root: npm run deploy:prod-clean

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

Write-Host "[DELETE] Deleting production database first..." -ForegroundColor Red
$deleteProc = Start-Process -FilePath "spacetime" -ArgumentList "delete","--no-config","--server","maincloud","the-mammoth","-y" -Wait -NoNewWindow -PassThru
if ($deleteProc.ExitCode -ne 0) {
  Write-Host "[DELETE] Database not found (404) or already gone - continuing with fresh publish." -ForegroundColor DarkYellow
}

Write-Host "[BUILD] Building and deploying to fresh production database..." -ForegroundColor Yellow
spacetime publish --no-config --server maincloud -p . the-mammoth -y
if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] Publish failed. Ensure you are logged in: spacetime login" -ForegroundColor Red
  Write-Host "[ERROR] If this DB does not exist in your account, create it once in the SpacetimeDB dashboard." -ForegroundColor Red
  exit 1
}

Write-Host "[GEN] Regenerating client bindings..." -ForegroundColor Yellow
spacetime generate --no-config --include-private -p . -l typescript -o "$outDir" -y
Assert-LastExit "Generate TypeScript bindings"

Write-Host "[GIT] Committing and pushing to trigger deployment..." -ForegroundColor Yellow
Set-Location $repoRoot
git add .
Assert-LastExit "git add"

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "Deploy: Clean database rebuild with new schema"
  Assert-LastExit "git commit"
} else {
  Write-Host "[GIT] No staged changes to commit; skipping commit." -ForegroundColor DarkYellow
}

git push
Assert-LastExit "git push"

Write-Host "[SUCCESS] Clean production deployment complete!" -ForegroundColor Green
Write-Host "[DB] Database: the-mammoth on maincloud" -ForegroundColor Cyan
Write-Host "[CLEAN] Production database was completely wiped and recreated" -ForegroundColor Magenta
