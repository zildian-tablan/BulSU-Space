#!/bin/bash

# Deploy Firebase Security Rules Shell Script

# Check if firebase-tools is installed
if ! command -v firebase &> /dev/null; then
    echo -e "\033[33mFirebase CLI is not installed. Installing now...\033[0m"
    npm install -g firebase-tools
fi

# Deploy the Firestore security rules
echo -e "\033[32mDeploying Firestore security rules...\033[0m"
firebase deploy --only firestore:rules --non-interactive

echo -e "\033[32mSecurity rules deployment completed.\033[0m" 