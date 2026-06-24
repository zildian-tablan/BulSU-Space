# Deploy Firebase Security Rules with Debug Output
# This script deploys the Firestore security rules with extra debug output

# Check if firebase-tools is installed
if (-not (Get-Command "firebase" -ErrorAction SilentlyContinue)) {
    Write-Host "Firebase CLI is not installed. Installing now..." -ForegroundColor Yellow
    npm install -g firebase-tools
}

# Display current rules before deploying
Write-Host "Current Firestore Rules:" -ForegroundColor Cyan
Get-Content -Path "firestore.rules" | Write-Host

# Deploy the Firestore security rules with debug flag
Write-Host "`nDeploying Firestore security rules with debug output..." -ForegroundColor Green
firebase deploy --only firestore:rules --debug

Write-Host "`nSecurity rules deployment completed. Now run the debug-reactions.js script to test." -ForegroundColor Green
Write-Host "To run debug script: node debug-reactions.js" -ForegroundColor Yellow
