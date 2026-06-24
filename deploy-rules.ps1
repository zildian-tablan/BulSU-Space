# Deploy Firebase Security Rules PowerShell Script

# Check if firebase-tools is installed
if (-not (Get-Command "firebase" -ErrorAction SilentlyContinue)) {
    Write-Host "Firebase CLI is not installed. Installing now..." -ForegroundColor Yellow
    npm install -g firebase-tools
}

# Deploy the Firestore security rules
Write-Host "Deploying Firestore security rules..." -ForegroundColor Green
firebase deploy --only firestore:rules --non-interactive

Write-Host "Security rules deployment completed." -ForegroundColor Green 