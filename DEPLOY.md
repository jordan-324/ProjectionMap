# Deploying to Render

This guide will help you deploy the Gesture Projection Mapper to Render, which provides HTTPS automatically (required for webcam access).

## Quick Deploy Steps

### Option 1: Deploy via Render Dashboard (Recommended)

1. **Push your code to GitHub** (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Go to Render Dashboard**:
   - Visit https://render.com
   - Sign up/login (free tier available)
   - Click "New +" → "Web Service"

3. **Connect your repository**:
   - Connect your GitHub account
   - Select your `ProjectionMap` repository

4. **Configure the service**:
   - **Name**: `projection-map` (or any name you like)
   - **Environment**: `Node`
   - **Build Command**: (leave empty)
   - **Start Command**: `npm start`
   - **Plan**: Free (or any plan you prefer)

5. **Deploy**:
   - Click "Create Web Service"
   - Render will automatically deploy your app
   - Wait for deployment to complete (usually 2-3 minutes)

6. **Access your app**:
   - Once deployed, you'll get a URL like: `https://projection-map.onrender.com`
   - Open this URL in your browser
   - The webcam will work because Render provides HTTPS automatically!

### Option 2: Deploy using render.yaml (Blueprints)

1. **Push your code to GitHub** (same as above)

2. **Go to Render Dashboard**:
   - Visit https://render.com
   - Click "New +" → "Blueprint"

3. **Connect repository**:
   - Connect your GitHub account
   - Select your repository
   - Render will detect the `render.yaml` file automatically

4. **Deploy**:
   - Click "Apply"
   - Render will create the service based on the YAML configuration

## After Deployment

- Your app will be available at: `https://your-app-name.onrender.com`
- **HTTPS is automatically enabled** - webcam will work!
- The app will automatically redeploy when you push to GitHub (if auto-deploy is enabled)

## Free Tier Notes

- Render's free tier includes:
  - HTTPS/SSL certificates (required for webcam)
  - Automatic deployments from GitHub
  - Services may spin down after 15 minutes of inactivity (they'll wake up on next request)

## Troubleshooting

- **Webcam not working**: Make sure you're accessing via HTTPS (Render provides this automatically)
- **Build fails**: Check the build logs in Render dashboard
- **Service not starting**: Verify `package.json` and `server.js` are correct

## Local Development

You can still develop locally using:
```bash
node server.js
# or
python3 server.py
```

Then access at: http://localhost:8000/

