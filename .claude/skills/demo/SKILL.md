---
name: demo
description: Produce a narrated demo video of Knowledge Horizon tailored to a specific feature or audience. Uses Playwright MCP to capture real app screenshots, edge-tts for voice narration, and ffmpeg to assemble the final MP4.
---

# Demo Video Producer

## Arguments
$ARGUMENTS — required: a description of what the video should showcase. Examples:
- "show how a new user browses a curated report and reads an article"
- "demonstrate the article viewer: abstract, full text, notes, and external links"
- "walk through creating a new research stream with the AI chat assistant"
- "show the curation workflow for a weekly report"
- "highlight the Tablizer feature for cross-article analysis"
- "quick overview of the dashboard and navigation for a new biomedical researcher"

## Instructions

You are producing a short narrated demo video of Knowledge Horizon, a biomedical research intelligence platform. Target length is **45-90 seconds** (most should be under 60 seconds). The video shows real app screenshots with professional voiceover narration.

### Flexibility

Unlike a fixed formula, each demo is shaped by what it needs to show. Some demos walk through a single feature in depth; others give a quick tour across several screens. Use the arguments to decide the right structure.

Common demo types:
- **Feature spotlight** — deep dive on one feature (article viewer, curation, Tablizer, chat)
- **Workflow walkthrough** — show a task end-to-end (set up a stream, curate a report, analyze articles)
- **Overview tour** — quick hop across 3-4 screens to show breadth
- **Persona demo** — tailored to a specific role (researcher, curator, team lead)

### Tools and paths

```
FFMPEG = r"C:\Users\cliff\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
MAGICK = r"C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe"
VOICE  = "en-US-AndrewMultilingualNeural"
```

- edge-tts: `python -m edge_tts` or `import edge_tts` for TTS audio generation
- Playwright MCP: browser_navigate, browser_click, browser_type, browser_take_screenshot, etc.
- Output directory: `_demo/` (frames in `_demo/frames/`, audio in `_demo/audio/`)
- Production URL: https://www.knowledgehorizon.ai
- Dev URL: http://localhost:5173
- Build script: `_demo/build_video.py` (supports JSON storyboard files)

### Step 1: Write the storyboard

Based on the arguments, write a storyboard JSON file at `_demo/storyboard-{topic}.json`. Format:

```json
{
    "output": "kh-demo-{topic}.mp4",
    "crossfade": 0.4,
    "closing_narration": "Knowledge Horizon. Stay ahead of the science that matters. Learn more at knowledge horizon dot A I.",
    "closing_tagline": "Stay ahead of the science.",
    "scenes": [
        {
            "frame": "01_landing.png",
            "narration": "...",
            "pad_before": 0.5,
            "pad_after": 0.8,
            "zoom": null
        }
    ]
}
```

**Scene planning guidelines:**
- Aim for **4-8 scenes** (plus auto-generated closing). More scenes = longer video.
- Each scene's narration should be 1-3 sentences max.
- Keep total narration under 60 seconds of speech for a sub-60-second video.
- Every scene needs a clear visual payoff — don't narrate over a screen that doesn't show what you're describing.

**Zoom spec** (optional per scene):
```json
"zoom": {"zoom_to": 2.0, "center_x": 0.5, "center_y": 0.5}
```
Use zoom to draw attention to a specific UI element (a button, a chat message, a table cell). `center_x` and `center_y` are 0-1 normalized coordinates.

### Step 2: Capture screenshots

Use Playwright MCP to navigate the app (dev URL) and capture each scene:

1. Set browser to 1280x720: `browser_resize(1280, 720)`
2. Make sure light mode is active (check for dark background, toggle if needed)
3. Navigate through the flow, capturing screenshots to `_demo/frames/XX_name.png`
4. For chat interactions: type the prompt, send it, wait for the AI response

**Important timing:**
- AI chat responses: 10-30 seconds — use `browser_wait_for` with appropriate text
- Stream creation steps: may take 30-60 seconds for AI to generate configs
- If a response seems stuck after 120 seconds, take a screenshot and note it as a timeout

**Important capture tips:**
- Use `browser_take_screenshot` with absolute paths in `_demo/frames/`
- For clean table/report screenshots, hide the chat panel if it's open
- When showing AI interaction, capture with the chat panel visible
- Capture at moments of visual payoff (data loaded, results displayed, modal open)

### Step 3: Build the video

Run the build script with the storyboard JSON:

```
python _demo/build_video.py _demo/storyboard-{topic}.json
```

The build script handles:
1. **Audio generation** with edge-tts (Andrew Multilingual voice)
2. **Audio caching** — narration text stored in sidecar `.txt` files; only regenerates when text changes
3. **Closing frame** via ImageMagick
4. **Assembly** with ffmpeg: Ken Burns drift on all scenes, crossfade transitions, per-scene timing
5. **Stale cleanup** — removes old audio files if scene count changes

### Step 4: Report

Tell the user:
- Where the video file is
- Duration and file size
- What scenes are included
- Offer to tweak narration, swap scenes, or adjust timing

### Voice guidelines

- Keep narration conversational, not salesy
- Say "Knowledge Horizon" naturally
- Refer to the URL as "knowledge horizon dot A I" in speech
- 1-3 sentences per scene max, let the visuals do the work
- Tailor language to the audience (a researcher hears "literature surveillance", a manager hears "team insights")
- Emphasize that the platform surfaces **real published research**, not AI-generated content
- **NEVER use em dashes, en dashes, or hyphens used as dashes in narration text.** Edge-tts mispronounces them badly. Replace with periods, commas, or restructure the sentence.

### Output

Final video: `_demo/kh-demo-{topic}.mp4`
