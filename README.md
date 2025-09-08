# rork-ea-converter
Created by Rork

## Deploying to Render (Docker-based Web Service)

This project builds a static web export of the Expo app and serves it via Bun inside a Docker container. A Render web service will build the image and run a static server.

### Files
- `Dockerfile`: builds the web export to `dist/` and serves it.
- `render.yaml`: configures a Render docker web service (`env: docker`).
- `.dockerignore`: excludes dependencies, build output, and editor files for smaller images.

### Build and run locally
```bash
# Build the image
docker build -t ea-converter:web .

# Run the container (serves on http://localhost:3000)
docker run --rm -p 3000:3000 ea-converter:web
```

### Deploy to Render
1. Push your repo to GitHub/GitLab.
2. In Render, create a New Web Service and select your repo.
3. Render detects `render.yaml` and configures a docker web service named `ea-converter-web`.
4. Deploy. The service will:
   - Install dependencies with Bun
   - Build the web export to `dist/`
   - Serve on port 3000

### Environment
- `EXPO_NO_TELEMETRY=1` is set in `render.yaml`.
- No runtime env vars are required for the offline app.

### Notes
- Networking is disabled in-app; only static export is served.
- If you change the port, update `ENV PORT` and `EXPOSE` in `Dockerfile` and Render health check path/port accordingly.
