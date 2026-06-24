# Deploy Database Rules PowerShell Script

Write-Host "Starting database rules deployment..." -ForegroundColor Green

# First backup the current rules
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = "database.rules.backup-$timestamp.json"
Copy-Item -Path "database.rules.json" -Destination $backupPath
Write-Host "Current rules backed up to: $backupPath" -ForegroundColor Cyan

# Check if firebase-tools is installed
if (-not (Get-Command "firebase" -ErrorAction SilentlyContinue)) {
    Write-Host "Firebase CLI is not installed. Installing now..." -ForegroundColor Yellow
    npm install -g firebase-tools
}

# Deploy the RTDB security rules
Write-Host "Deploying Realtime Database security rules..." -ForegroundColor Green
firebase deploy --only database

Write-Host "Database rules deployment completed." -ForegroundColor Green 
Write-Host "Now your status updates should work!" -ForegroundColor Green 
