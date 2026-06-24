# BulSU Space Deployment Guide

## Current Status
✅ Frontend deployed to: https://bulsuspace.web.app
⏳ Backend deployment in progress

## Frontend Deployment (Completed)
The React frontend has been successfully deployed to Firebase Hosting at `https://bulsuspace.web.app`.

## Backend Deployment Options

### Option 1: Railway (Recommended)
1. Install Railway CLI: `npm install -g @railway/cli`
2. Login to Railway: `railway login`
3. Navigate to server directory: `cd server`
4. Initialize Railway project: `railway init`
5. Deploy: `railway up`

### Option 2: Render
1. Create account at render.com
2. Connect your GitHub repository
3. Create a new Web Service
4. Set build command: `cd server && npm install`
5. Set start command: `npm start`

### Option 3: Heroku
1. Install Heroku CLI
2. Login: `heroku login`
3. Create app: `heroku create bulsuspace-api`
4. Deploy: `git subtree push --prefix server heroku main`

## Environment Variables Needed
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `PORT` (set automatically by most platforms)

## After Backend Deployment
Once backend is deployed, update these files with the actual URLs:
1. `src/services/api.ts` - Update production API URL
2. `src/services/callService.ts` - Update signaling server URL

## Current CORS Configuration
The servers are already configured to accept requests from:
- https://bulsuspace.web.app
- https://bulsuspace.firebaseapp.com
- Local development URLs

## Next Steps
1. Deploy backend to your chosen platform
2. Update production URLs in the code
3. Redeploy frontend with updated URLs
4. Test the complete system
