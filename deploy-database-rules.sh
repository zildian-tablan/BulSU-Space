#!/bin/bash

echo "Starting database rules deployment..."

# Backup current rules
timestamp=$(date +"%Y%m%d_%H%M%S")
backup_path="database.rules.backup-$timestamp.json"
cp database.rules.json "$backup_path"
echo "Current rules backed up to: $backup_path"

# Check if firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "Firebase CLI is not installed. Installing now..."
    npm install -g firebase-tools
fi

# Deploy the RTDB security rules
echo "Deploying Realtime Database security rules..."
firebase deploy --only database

echo "Database rules deployment completed."
echo "Now your status updates should work!"
