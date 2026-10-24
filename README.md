# House Memory

House Memory is a private, self-hosted construction archive. It places dated 360° photographs on floor plans, making it possible to revisit concealed pipes, ducts, wiring, and structural work after the house is finished.

The application is designed for a single household and a LAN-only Coolify deployment. It has no external CDN, analytics service, or cloud-media dependency.

## Features

- Basement, ground-floor, and first-floor plans
- Click-to-place camera locations using normalized plan coordinates
- Multiple dated captures at the same physical location
- Construction timeline showing the newest capture available at each location as of the selected date
- Interactive equirectangular 360° image viewer
- Point timelapse with crossfades, date scrubbing, playback pace, and optional nearby photographs
- Capture descriptions, tags, initial viewing direction, and location history
- Password-protected application, floor plans, and uploaded media
- Separate view-only and administrator passwords, enforced by the server
- Admin editing of capture notes, date/time, tags, viewing direction, pin coordinates, and floor
- Move one capture independently or move a camera point with its entire history
- PostgreSQL metadata storage
- Persistent filesystem storage for panorama files
- Responsive desktop and mobile interface
- Docker Compose deployment for Coolify

The repository intentionally contains no example locations or captures. A new installation starts with empty timelines and the three included floor plans.

## Architecture

| Component | Purpose |
| --- | --- |
| React + Vite | Browser interface |
| Express | Authentication, API, and protected file delivery |
| PostgreSQL | Floors, locations, capture dates, descriptions, tags, and file metadata |
| Photo Sphere Viewer | Interactive stitched panorama display |
| Docker Compose | Application and database deployment |

Uploaded panoramas are stored under `/app/data` in the application container. PostgreSQL uses `/var/lib/postgresql/data`. Both paths are backed by named Docker volumes in `compose.yaml`.

## Preparing Insta360 photographs

Export each photograph as a stitched **2:1 equirectangular JPEG**. PNG and WebP are also accepted, with a maximum upload size of 120 MB.

Keep the original `.insp` files in a separate archive. Browsers cannot display them directly, and House Memory does not replace an original-media backup.

For X3 HDR photographs, import every exposure belonging to a shot together in Insta360 Studio (at least three). Let Studio merge the HDR group, then export a **360 photo**, not a reframed flat photo. The result must be a stitched 2:1 equirectangular JPEG. Merely renaming an INSP file leaves two fisheye circles and will not display correctly in the panorama viewer.

## Viewer and admin access

`APP_PASSWORD` is the existing household viewer password. Viewers can explore plans, photos, and history but cannot upload, add notes, edit, move, or delete anything. Existing sessions automatically become view-only after the upgrade.

`ADMIN_PASSWORD` enables editing using the same login screen or **Admin sign in** in the top bar. There is no default admin password. Set a private `ADMIN_PASSWORD` runtime value in Coolify; The application requires it at startup in production; the image build does not need this runtime secret. It must differ from `APP_PASSWORD`. Production startup fails if `ADMIN_PASSWORD` is missing; in development, admin sign-in stays disabled until it is set. Passwords are never sent to the frontend or stored in session tokens. Changing a configured password invalidates new-format sessions for that role.

Select a pin, then choose **Move pin / floor**. Choose Basement, Ground floor, or First floor and click the correct position on the preview plan, or enter X/Y percentages. By default, only the selected capture moves; if a point has multiple captures, the whole history can be moved instead. **Edit capture / notes** changes the capture metadata without replacing the photograph.

Each production start also saves a metadata snapshot under `/app/data/backups/`, outside the web-served uploads directory. Media stays in the persistent panorama volume. These metadata snapshots supplement backups of both Docker volumes; they do not replace a full media and database backup.

## Timelapse and viewing direction

Select a camera point and choose **Timelapse**. Playback starts at its earliest available visit and fades through one real photograph per date. Use Play/Pause, the date slider, or the previous/next controls; the pace menu changes the time spent on each photograph. Playback waits for the image and fade to finish, stops at the last visit, and pauses when the tab is hidden or an editing dialog opens. Reduced-motion preferences disable the fades.

**Include nearby photos** fills missing visits with the closest photograph on the same floor, within 12% of the plan size. Every distance is measured from the point originally selected, so the sequence cannot drift through the house. Exact-point photographs take priority; nearby frames are labelled. Roof and scaffold views are kept out of indoor sequences. Turn the option off for exact-point history only. Choosing a different point or floor exits the timelapse.

The saved starting direction aligns photographs over time. Looking around preserves the same relative direction and pitch when moving between dates; each photograph opens fully zoomed out. In admin mode, look toward a fixed landmark, open **Details**, and choose **Save current view as starting direction** to correct the selected photograph. Nearby camera positions can introduce parallax even when their directions agree.

## Floor plans

The plans are located in `plans/`:

- `basement.svg`
- `ground.svg`
- `first.svg`

They can be replaced without changing application code. Preserve the filenames and use a tightly cropped SVG `viewBox`; irrelevant page margins make marker placement less precise. Keeping the same orientation and scale across all three exports makes floor switching easier to understand.

## Local development

### Quick interface development without PostgreSQL

Requirements: Node.js 24 and pnpm 11.

```bash
pnpm install
USE_IN_MEMORY_DB=true pnpm dev
```

Open `http://localhost:5173`. The development viewer password is `house`. Set `ADMIN_PASSWORD` in the environment to enable admin sign-in; it has no default. The in-memory database is empty and resets whenever the server restarts.

### Full local Docker deployment

Requirements: Docker with Docker Compose.

```bash
cp .env.example .env
```

Set secure values in `.env`. URL-safe hexadecimal values avoid connection-string escaping issues:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 24   # POSTGRES_PASSWORD
```

Then start the application with the local port override:

```bash
docker compose -f compose.yaml -f compose.local.yaml up --build -d
```

Open `http://localhost:3000`. Stop it with:

```bash
docker compose -f compose.yaml -f compose.local.yaml down
```

Do not add `-v` unless you intentionally want to delete both the database and panorama volumes.

## Coolify deployment

These instructions follow Coolify's current [Docker Compose build-pack](https://coolify.io/docs/applications/build-packs/docker-compose) and [Compose deployment](https://coolify.io/docs/knowledge-base/docker/compose) guidance.

### 1. Connect the repository

1. In Coolify, open the desired project and environment.
2. Choose **Create New Resource**.
3. Select the private repository through the GitHub App or a deploy key.
4. Select `mhaegens/House-Timeline` and the `main` branch.
5. Choose **Docker Compose** as the build pack.
6. Set the base directory to `/` and the Compose file to `/compose.yaml`.

### 2. Configure secrets

Coolify detects the variables referenced by `compose.yaml`. Set these as runtime variables:

```dotenv
APP_PASSWORD=choose-a-long-private-password
ADMIN_PASSWORD=<your-private-admin-password>
SESSION_SECRET=<64 hexadecimal characters>
POSTGRES_PASSWORD=<48 hexadecimal characters>
COOKIE_SECURE=false
```

Generate the two machine secrets with:

```bash
openssl rand -hex 32
openssl rand -hex 24
```

`APP_PASSWORD`, `SESSION_SECRET`, and `POSTGRES_PASSWORD` are marked as required in the Compose file. `ADMIN_PASSWORD` is required by the application at production startup and can stay runtime-only in Coolify. See Coolify's [environment-variable documentation](https://coolify.io/docs/knowledge-base/environment-variables) for its normal and developer views.

Use `COOKIE_SECURE=true` only when the application is served over HTTPS. An HTTP-only LAN hostname requires `false`, otherwise the browser will not send the login cookie.

### 3. Keep it LAN-only

`compose.yaml` exposes port 3000 to Coolify's internal Docker network but does **not** publish a host port. This avoids accidentally bypassing Coolify's proxy.

For convenient LAN access:

1. Create a local DNS record such as `house-timeline.home.arpa` pointing to the Coolify server's LAN IP.
2. Assign `http://house-timeline.home.arpa:3000` as the domain for the `app` service. The `:3000` tells Coolify which container port to proxy; clients still use the normal HTTP port.
3. Do not create a public DNS record, router port-forward, or public tunnel for this hostname.
4. Keep the application password enabled even on a trusted LAN.

Coolify documents the domain-to-container-port syntax in its [domain guide](https://coolify.io/docs/knowledge-base/domains). If you use an internal HTTPS setup, assign an HTTPS domain and change `COOKIE_SECURE` to `true`.

### 4. Verify storage

The Compose deployment creates two persistent named volumes:

- `panorama_data` → `/app/data`
- `postgres_data` → `/var/lib/postgresql/data`

Confirm both appear in the resource's storage configuration after Coolify parses the Compose file. Coolify prefixes volume names with the resource UUID to prevent collisions. See the [persistent-storage documentation](https://coolify.io/docs/knowledge-base/persistent-storage).

Both volumes must be included in backups. Database-only backups do not contain the panorama files, and panorama-only backups do not contain marker positions or descriptions.

### 5. Deploy and validate

1. Click **Deploy**.
2. Wait for both `database` and `app` to report healthy.
3. Open the LAN hostname and sign in using `APP_PASSWORD`.
4. Switch through all three plans.
5. Add one test camera point and capture, then confirm it remains after a redeploy.
6. Delete the test capture if it is not part of the real archive.

## Updating

Push changes to the configured branch and redeploy the Coolify resource. The named volumes survive image rebuilds and container replacement.

Before significant upgrades, back up both persistent volumes. Never use `docker compose down -v` on the production resource.

## Security notes

- Keep the repository private because the floor plans describe the house.
- Keep Coolify, the host OS, Docker, and PostgreSQL images updated.
- Restrict the Coolify server and the House Memory hostname to the LAN or a trusted VPN.
- Use strong, distinct `APP_PASSWORD` and `ADMIN_PASSWORD` values.
- Do not commit `.env`; it is excluded by `.gitignore`.
- Treat exported panoramas and their backups as sensitive household data.

## Validation commands

```bash
pnpm check
pnpm test
pnpm build
```

The application exposes an unauthenticated `/healthz` endpoint for container health checks. All plans, captures, uploads, and API data remain behind the session cookie.

