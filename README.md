# Gesture Projection Mapper

A web-based projection mapping tool controlled by hand gestures using MediaPipe Hands and Three.js.

## Features

- Real-time webcam projection mapping
- Hand gesture control (pinch to interact)
- Corner-based projection adjustment
- Save/load projection layouts
- Performance mode for clean projection

## Setup

### Running Locally

**Important**: Browsers require HTTPS or localhost for webcam access. You cannot use `file://` protocol.

#### Option 1: Python Server (Recommended)

```bash
python3 server.py
```

Then open: http://localhost:8000/base/index.html

#### Option 2: Node.js Server

```bash
node server.js
```

Or if you have `http-server` installed:

```bash
npx http-server -p 8000
```

Then open: http://localhost:8000/base/index.html

#### Option 3: PHP Server

```bash
php -S localhost:8000
```

Then open: http://localhost:8000/

## Deploying to Render (Recommended for Easy Access)

**Why Render?** Render provides HTTPS automatically, which is required for webcam access. No need to run a local server!

See [DEPLOY.md](./DEPLOY.md) for detailed deployment instructions.

**Quick steps:**
1. Push your code to GitHub
2. Go to https://render.com and create a new Web Service
3. Connect your GitHub repository
4. Set Start Command to: `npm start`
5. Deploy!

Your app will be live at `https://your-app.onrender.com` with HTTPS enabled.

## Usage

1. Allow camera access when prompted
2. Wait for "Camera ready" message
3. Use pinch gesture to:
   - **Scale**: Pinch in empty space and move
   - **Move corners**: Pinch near a corner (orange sphere) to drag it
4. Click "Performance Mode" to hide UI elements
5. Save/load layouts as needed

## Troubleshooting

- **Camera not working**: Make sure you're using localhost (not file://)
- **Permission denied**: Check browser settings and allow camera access
- **No video showing**: Check browser console for errors

