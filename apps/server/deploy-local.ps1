# Fast local database deployment script
# Updates existing database without deleting
# Run from repo root: npm run deploy:local

$binaryenBin = "$env:LOCALAPPDATA\Programs\Binaryen\binaryen-version_126\bin"
if (Test-Path (Join-Path $binaryenBin "wasm-opt.exe")) {
  $env:Path = $binaryenBin + ";" + $env:Path
}

$env:CARGO_TARGET_DIR = "C:\RustBuild\the-mammoth-target"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$modulePath = $scriptDir
$outDir = [System.IO.Path]::GetFullPath((Join-Path $scriptDir "..\client\src\module_bindings"))

function Assert-LastExit([string]$stepName) {
  if ($LASTEXITCODE -ne 0) {
    throw "[ERROR] $stepName failed with exit code $LASTEXITCODE."
  }
}

Set-Location $modulePath

Write-Host "[BUILD] Building and deploying to local database..." -ForegroundColor Yellow
spacetime publish --no-config -p . mammoth-local -y
Assert-LastExit "Publish to local database"

Write-Host "[GEN] Regenerating client bindings..." -ForegroundColor Yellow
spacetime generate --no-config --include-private -p . -l typescript -o "$outDir" -y
Assert-LastExit "Generate TypeScript bindings"

Write-Host "[SUCCESS] Local deployment complete! Database: mammoth-local" -ForegroundColor Green
Write-Host "[INFO] Run 'npm run dev' from project root to test" -ForegroundColor Cyan
Write-Host "[INFO] Database was updated (not wiped)" -ForegroundColor Blue
