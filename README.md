# Travel Vlog Agent

An agentic pipeline to turn raw travel clips into a planned 30-minute YouTube vlog:

1. Discover and score clips from a folder.
2. Build a timeline plan targeting 30 minutes.
3. Generate FFmpeg concat manifest + render command.
4. Build YouTube metadata payload (and optionally upload).

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
travel-vlog-agent init-config
```

Edit `agent_config.json`:

- `clips_dir`: directory containing your raw footage.
- `output_dir`: where plan/render/publish artifacts should be written.
- `target_minutes`: default 30.
- `min_segment_seconds` / `max_segment_seconds`: pacing controls.

Run end-to-end:

```bash
travel-vlog-agent run \
  --trip-name "Japan Spring Trip" \
  --locations "Tokyo,Kyoto,Osaka" \
  --highlights "Shibuya crossing,Fushimi Inari,Street food"
```

Outputs in `output_dir`:

- `discovered_clips.json`
- `vlog_plan.json`
- `timeline_concat.txt`
- `render_instructions.json`
- `publish_payload.json`

Render your vlog:

```bash
# copy the generated command from render_instructions.json
ffmpeg -y -f concat -safe 0 -i "output/timeline_concat.txt" \
  -vf "scale='min(1920,iw)':-2,fps=30" \
  -c:v libx264 -preset medium -crf 20 \
  -c:a aac -b:a 192k \
  "output/travel_vlog_30min.mp4"
```

## Optional YouTube upload

The CLI can optionally upload directly:

```bash
travel-vlog-agent publish --trip-name "Japan Spring Trip" --upload
```

To enable this, install:

```bash
pip install google-api-python-client google-auth-oauthlib google-auth-httplib2
```

And place these files at project root:

- `youtube_client_secret.json`
- `youtube_token.json`

## Tests

```bash
pytest
```
