param(
  [string]$BucketName = $env:STORAGE_BUCKET,
  [string]$LifecycleFile = "$PSScriptRoot\..\storage-lifecycle.json"
)

if (-not $BucketName) {
  Write-Host "Usage: .\set-bucket-lifecycle.ps1 -BucketName your-bucket-name"
  Write-Host "Or set environment variable `STORAGE_BUCKET` and re-run.";
  exit 1
}

if (-not (Test-Path $LifecycleFile)) {
  Write-Host "Lifecycle file not found: $LifecycleFile"
  exit 1
}

# Prefer gsutil if available
$gsutil = Get-Command gsutil -ErrorAction SilentlyContinue
if ($gsutil) {
  Write-Host "Applying lifecycle with gsutil to gs://$BucketName ..."
  & $gsutil.Path lifecycle set $LifecycleFile "gs://$BucketName"
  if ($LASTEXITCODE -ne 0) { Write-Host "gsutil failed with exit code $LASTEXITCODE"; exit $LASTEXITCODE }
  Write-Host "Lifecycle applied successfully."
  exit 0
}

# Fallback: try gcloud (alpha storage)
$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if ($gcloud) {
  Write-Host "gsutil not found. Attempting to use gcloud to update lifecycle..."
  # Note: gcloud storage may be under alpha/beta. Adjust command if required by your SDK version.
  & $gcloud.Path alpha storage buckets update --lifecycle-file=$LifecycleFile --project=$env:GCLOUD_PROJECT $BucketName
  if ($LASTEXITCODE -ne 0) { Write-Host "gcloud failed with exit code $LASTEXITCODE"; exit $LASTEXITCODE }
  Write-Host "Lifecycle applied successfully with gcloud."
  exit 0
}

Write-Host "Neither gsutil nor gcloud was found in PATH. Install Google Cloud SDK and retry."; exit 1
