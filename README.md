# 🎵 lofi.fm

A fast, minimalistic, glassmorphic realtime music-room app for synchronized YouTube playback with friends.

![Status](https://img.shields.io/badge/status-in%20development-yellow)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange)

---

## ✨ Features

- 🎶 **Synchronized YouTube Playback** - Watch videos together in perfect sync
- 💬 **Realtime Chat** - Talk with friends while listening
- 🎨 **Glassmorphic UI** - Beautiful, modern design with blur effects and gradients
- 🌙 **Multiple Themes** - Night Purple, Monochrome, Red/Black, Everforest
- 📱 **Mobile Optimized** - Responsive design with background playback support
- 🔍 **YouTube Search** - Search and add songs directly from the app
- 📋 **Playlist Support** - Paste YouTube playlist URLs to add multiple songs
- 👑 **Admin Controls** - Room creator can manage queue and users
- 🎯 **Anonymous** - No login required, just pick a username and join
- ⚡ **Fast & Lightweight** - Built on Cloudflare's edge network

---

## 🏗️ Tech Stack

### Frontend
- **Next.js 15** (App Router)
- **TypeScript**
- **TailwindCSS** + **shadcn/ui**
- **Framer Motion** (animations)
- **YouTube Iframe API**
- **Media Session API** (background playback)

### Backend
- **Cloudflare Workers** (serverless edge computing)
- **Durable Objects** (realtime state + WebSocket)
- **YouTube Data API v3** (search & metadata)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Cloudflare account (free tier works)
- YouTube Data API v3 key ([Get one here](https://console.cloud.google.com/apis/library/youtube.googleapis.com))

### Option 1: Quick Start Script (Recommended)

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd lofi.fm

# 2. Setup environment variables
cd worker
cp .dev.vars.example .dev.vars
# Edit .dev.vars and add your YouTube API key

cd ../frontend
cp .env.example .env.local
# Edit .env.local (default values should work for local dev)

# 3. Run the development script
cd ..
./dev.sh
```

This will start both frontend (`:3000`) and worker (`:8787`) automatically!

### Option 2: Manual Setup

**Backend (Worker)**:
```bash
cd worker
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars and add your YouTube API key
npm run dev
```

**Frontend**:
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local (default: http://localhost:8787)
npm run dev
```

### 4. Open the App
Visit `http://localhost:3000` and create your first room!

📖 **Detailed setup guide**: See [SETUP.md](./SETUP.md)  
🚀 **Deployment guide**: See [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 📦 Project Structure

```
lofi.fm/
├── frontend/               # Next.js 15 app
│   ├── app/               # App Router pages
│   │   ├── page.tsx       # Home (create/join room)
│   │   └── room/[id]/     # Room page
│   ├── components/        # React components
│   │   ├── ui/            # shadcn/ui components
│   │   ├── Player.tsx     # YouTube player
│   │   ├── Queue.tsx      # Song queue
│   │   ├── Chat.tsx       # Chat component
│   │   └── ...
│   ├── lib/               # Utilities
│   │   ├── websocket.ts   # WebSocket client
│   │   ├── youtube.ts     # YouTube API helpers
│   │   └── storage.ts     # localStorage utils
│   ├── hooks/             # Custom React hooks
│   └── public/            # Static assets, PWA manifest
│
├── worker/                # Cloudflare Worker
│   ├── src/
│   │   ├── index.ts       # Worker entry point
│   │   ├── room.ts        # Durable Object (room state)
│   │   └── types.ts       # Shared TypeScript types
│   └── wrangler.toml      # Cloudflare config
│
├── DECISIONS.md           # Architecture decisions
├── TODO.md                # Development tasks
└── README.md              # This file
```

---

## 🔧 Configuration

### Environment Variables

#### Frontend (`.env.local`)
```env
NEXT_PUBLIC_WORKER_URL=http://localhost:8787  # Cloudflare Worker URL
```

#### Worker (`.env` or Cloudflare dashboard)
```env
YOUTUBE_API_KEY=your_youtube_api_key_here
```

---

## 🎮 How to Use

### Creating a Room
1. Enter a unique room name (alphanumeric + hyphens)
2. Click "Create Room"
3. Share the room link with friends

### Joining a Room
1. Enter the room code or paste the invite link
2. Choose a username and emoji
3. Click "Join Room"

### Adding Songs
- **Search**: Use the search bar to find YouTube videos
- **Paste URL**: Paste a YouTube video or playlist URL
- Songs are added to the queue automatically

### Admin Controls
- **Skip**: Skip to next song
- **Remove**: Remove songs from queue
- **Clear Queue**: Remove all songs
- **Kick User**: Remove users from room

### Themes
- Change theme in settings (top-right)
- Enable "Sync theme for all users" to apply your theme to everyone

---

## 🌐 Deployment

### Deploy Frontend (Cloudflare Pages)

1. **Connect Git Repository**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
   - Click "Create a project" → "Connect to Git"
   - Select your repository

2. **Configure Build**
   ```
   Build command: cd frontend && npm run build
   Build output directory: frontend/.next
   Root directory: /
   ```

3. **Add Environment Variables**
   - `NEXT_PUBLIC_WORKER_URL` = `https://your-worker.your-subdomain.workers.dev`

4. **Deploy**
   - Click "Save and Deploy"
   - Your app will be live at `https://your-project.pages.dev`

### Deploy Worker (Cloudflare Workers)

1. **Install Wrangler CLI**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

3. **Deploy Worker**
   ```bash
   cd worker
   wrangler deploy
   ```

4. **Add Environment Variables**
   ```bash
   wrangler secret put YOUTUBE_API_KEY
   # Paste your YouTube API key when prompted
   ```

5. **Your Worker is live!**
   - URL: `https://lofi-fm-worker.your-subdomain.workers.dev`

### Update Frontend Environment
After deploying the Worker, update your frontend's `NEXT_PUBLIC_WORKER_URL` in Cloudflare Pages settings to point to your production Worker URL.

---

## 📱 Mobile Support

- **Background Playback**: Music continues when you switch apps or lock screen
- **Media Controls**: Use system media controls (lock screen, notification)
- **PWA**: Install as an app on your phone for a native experience

---

## 🐛 Troubleshooting

### WebSocket Connection Failed
- Check that Worker is running (`npm run dev` in `worker/`)
- Verify `NEXT_PUBLIC_WORKER_URL` in `.env.local`
- Check browser console for CORS errors

### YouTube Player Not Loading
- Verify YouTube API key is set in Worker environment
- Check browser console for API errors
- Ensure video is not region-restricted

### Room Not Found
- Room may have been deleted (rooms auto-delete when empty)
- Check room name spelling
- Create a new room if needed

### Background Playback Not Working (Mobile)
- Enable autoplay in browser settings
- Grant notification permissions (for Media Session API)
- Test on different browsers (Chrome, Safari)

---

## 📝 WebSocket Protocol

### Client → Server Messages
```typescript
{ type: "JOIN", payload: { userId, username, emoji } }
{ type: "ADD_SONG", payload: { videoId, title, thumbnail, duration } }
{ type: "REMOVE_SONG", payload: { videoId } }
{ type: "PLAY", payload: { timestamp } }
{ type: "PAUSE", payload: {} }
{ type: "SEEK", payload: { timestamp, currentTime } }
{ type: "SKIP", payload: {} }
{ type: "CHAT", payload: { message } }
{ type: "CHANGE_THEME", payload: { theme } }
{ type: "KICK_USER", payload: { userId } }
{ type: "CLEAR_QUEUE", payload: {} }
{ type: "REQUEST_SYNC", payload: {} }
```

### Server → Client Messages
```typescript
{ type: "STATE", payload: { queue, currentTrack, users, isPlaying, startTimestamp, adminId } }
{ type: "USER_JOINED", payload: { user } }
{ type: "USER_LEFT", payload: { userId } }
{ type: "SONG_ADDED", payload: { song } }
{ type: "SONG_REMOVED", payload: { videoId } }
{ type: "PLAYBACK_UPDATE", payload: { isPlaying, startTimestamp } }
{ type: "CHAT_MESSAGE", payload: { userId, username, message, timestamp } }
{ type: "THEME_CHANGED", payload: { theme } }
{ type: "ERROR", payload: { message } }
```

---

## 🤝 Contributing

This is a personal project, but feel free to fork and customize!

---

## 📄 License

MIT License - feel free to use this project however you'd like!

---

## 🙏 Acknowledgments

- YouTube API for video playback
- Cloudflare for edge infrastructure
- shadcn/ui for beautiful components
- The lofi community for inspiration 🎧

---

**Built with ❤️ for the lofi vibes**
