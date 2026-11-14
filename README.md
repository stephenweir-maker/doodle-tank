# 🐟 Doodle Tank

Draw a fish on paper (or on your phone or iPad), and it comes to life in a 3D aquarium.

**▶ Play it:** https://stephenweir-maker.github.io/doodle-tank/

- Snap a photo of a drawing and trace around it with your finger to cut it out, or draw straight on the screen
- Fish swim, school, play tag, chase toys, kiss their best friends, sulk when they lose food, have birthday parties and copy each other's tricks
- Pet them, hand-feed them, call them by name, knock on the glass, turn the lights out
- Three tanks to pick from: **Coral reef**, **Sunken shipwreck** and **River pond**
- Hats, food and castles you draw yourself
- Photo mode, a clean view with the menus hidden, and full screen
- **Group tank**: each child keeps their own tank and sends fish to one shared tank

Everything is one file, `index.html`. Each device saves its own tank in the browser.

---

## 👥 Group tank: three ways to share

| Where the game is opened | How the group tank is shared |
| --- | --- |
| Inside Claude, signed in | Through your Claude account (all devices signed into the same account) |
| From your own Doodle Tank server | Joins that server automatically |
| GitHub Pages or anywhere else | 🎨 Tank → Group tank → type your server's address |

### Host your own shared tank

The server is a single file with no dependencies. It serves the game too, so the iPads can open it straight from your server.

**With Node (18 or newer):**

```bash
git clone https://github.com/stephenweir-maker/doodle-tank.git
cd doodle-tank
TANK_KEY=pick-a-password node server/server.js
```

Then on each iPad, open `http://<your-server-ip>:8080` on your home Wi-Fi. If you set a `TANK_KEY`, enter it once in 🎨 Tank → Group tank.

**With Docker:**

```bash
TANK_KEY=pick-a-password docker compose up -d
```

Tanks are saved as JSON files in `./data` (Docker) or `server/data` (Node).

| Setting | Default | What it does |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on |
| `TANK_KEY` | *(none)* | Password players need to join. Strongly recommended if the server is reachable from the internet |
| `DATA_DIR` | `server/data` | Where tanks are saved |
| `DEFAULT_TANK` | `family` | Tank the game joins automatically when opened from the server |
| `MAX_FISH` | `60` | Most fish one tank can hold |

You can run several separate tanks on one server: type a different **tank name** in the game's settings (for example `cousins`).

### Using your server from the GitHub Pages version

GitHub Pages is `https`, and browsers won't let an `https` page talk to a plain `http` server. Either:

- open the game **from your server** (`http://<server-ip>:8080`), which is easiest at home, or
- put the server behind HTTPS, for example with a reverse proxy (Caddy, nginx), a Cloudflare Tunnel or Tailscale Funnel, then enter that `https://` address in the game.

The game inside Claude can't reach outside servers, so it always uses your Claude account for the group tank.

### Server API

| Method | Path | |
| --- | --- | --- |
| `GET` | `/api/info` | `{ app, needKey, defaultTank, maxFish }` |
| `GET` | `/api/tanks/:tank/fish` | All fish in a tank |
| `PUT` | `/api/tanks/:tank/fish/:id` | Add or update a fish |
| `DELETE` | `/api/tanks/:tank/fish/:id` | Remove a fish |
| `GET` | `/api/tanks/:tank/events` | Live updates (Server-Sent Events: `snapshot`, `put`, `delete`) |

Send the key as an `X-Tank-Key` header (or `?key=` for the events stream).

---

Inspired by *Drawquarium* by byKaleb. This is an independent fan-made project.
