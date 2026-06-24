#!/bin/bash

# Deploy Firebase Indexes Shell Script

# Check if firebase-tools is installed
if ! command -v firebase &> /dev/null; then
    echo -e "\033[33mFirebase CLI is not installed. Installing now...\033[0m"
    npm install -g firebase-tools
fi

# Deploy the Firestore indexes
echo -e "\033[32mDeploying Firestore indexes...\033[0m"
firebase deploy --only firestore:indexes --non-interactive

echo -e "\033[32mIndex deployment completed.\033[0m" 