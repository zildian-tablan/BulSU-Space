# Deploy Firebase Indexes PowerShell Script

# Check if firebase-tools is installed
if (-not (Get-Command "firebase" -ErrorAction SilentlyContinue)) {
    Write-Host "Firebase CLI is not installed. Installing now..." -ForegroundColor Yellow
    npm install -g firebase-tools
}

# Deploy the Firestore indexes
Write-Host "Deploying Firestore indexes..." -ForegroundColor Green
firebase deploy --only firestore:indexes --non-interactive

Write-Host "Index deployment completed." -ForegroundColor Green 