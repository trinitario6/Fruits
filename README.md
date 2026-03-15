# 🍉 Fruit Merge PWA

A juicy offline fruit merge puzzle game — drop fruits, merge matching ones into bigger fruits, and try to reach the legendary Watermelon! 

Inspired by Suika Game.

## 🎮 How to Play

- **Move** your mouse or finger to aim
- **Click or tap** to drop a fruit
- **Merge** two matching fruits to create a bigger one
- **Reach the 🍉 Watermelon** for maximum points!
- Don't let fruits pile above the danger line!

## 🚀 Deploy to GitHub Pages

### Step 1 — Create a GitHub Repo

1. Go to [github.com/new](https://github.com/new)
2. Name it `fruit-merge` (or anything you like)
3. Set it to **Public**
4. Click **Create repository**

### Step 2 — Upload the files

Upload all these files into the repo root:
```
index.html
game.js
sw.js
manifest.json
icons/
  icon-192.png
  icon-512.png
README.md
```

You can drag-and-drop them via the GitHub web interface, or use git:

```bash
git init
git add .
git commit -m "🍉 Initial fruit merge game"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fruit-merge.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Choose **main** branch, **/ (root)** folder
4. Click **Save**

Your game will be live at:
```
https://YOUR_USERNAME.github.io/fruit-merge/
```

(It may take 1–2 minutes to go live the first time.)

### Step 4 — Install as PWA (optional)

Once deployed, visit the URL on your phone:
- **Android**: Tap the browser menu → "Add to Home Screen"
- **iPhone**: Tap Share → "Add to Home Screen"

The game works fully **offline** after the first load!

## 🛠 Tech Stack

- Vanilla JS — no frameworks, no dependencies
- HTML5 Canvas for rendering
- Custom physics engine (gravity, collision, bouncing)
- Service Worker for offline caching
- Web App Manifest for PWA installability
- LocalStorage for high score persistence

## 🍓 Fruit Evolution Chain

🍒 → 🍓 → 🍇 → 🍊 → 🍎 → 🍐 → 🍑 → 🍋 → 🍍 → 🥭 → 🍉
