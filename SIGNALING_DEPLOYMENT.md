# Signaling Server Deployment Guide

## Deploy to Heroku (Recommended for quick setup)

### 1. Prepare the signaling server for deployment
```bash
# Create a new directory for just the signaling server
mkdir bulsuspace-signaling
cd bulsuspace-signaling

# Copy necessary files
cp ../server/signaling-server.js ./
cp ../server/package.json ./

# Create a new package.json specifically for signaling server
```

### 2. Create a minimal package.json for the signaling server
```json
{
  "name": "bulsuspace-signaling",
  "version": "1.0.0",
  "description": "Signaling server for BulSU Space",
  "main": "signaling-server.js",
  "scripts": {
    "start": "node signaling-server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.8.1",
    "cors": "^2.8.5"
  }
}
```

### 3. Deploy to Heroku
```bash
# Install Heroku CLI if not already installed
# Create Heroku app
heroku create bulsuspace-signaling

# Deploy
git init
git add .
git commit -m "Initial signaling server deployment"
heroku git:remote -a bulsuspace-signaling
git push heroku main
```

### 4. Alternative: Deploy to Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### 5. Update the frontend
After deploying, update the URL in `src/services/callService.ts`:
```javascript
return 'https://bulsuspace-signaling.herokuapp.com'; // Your actual deployed URL
```

## Current Status
- ✅ CORS is properly configured
- ✅ Frontend deployed to https://bulsuspace.web.app
- ✅ API server running locally with proper CORS
- ⏳ Signaling server needs HTTPS deployment for production calls
