"""
Demo video builder for Knowledge Horizon
Assembles screenshots + narration + Ken Burns/zoom effects + crossfade transitions.

Usage:
    python build_video.py storyboard.json       # Uses JSON storyboard file
    python build_video.py                        # Uses embedded storyboard (placeholder)

Audio caching: narration text is stored in sidecar .txt files next to each .mp3.
If the narration changes, that scene's audio is automatically regenerated.
"""
import asyncio
import json
import subprocess
import sys
import os

DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
FRAMES_DIR = os.path.join(DEMO_DIR, "frames")
AUDIO_DIR = os.path.join(DEMO_DIR, "audio")

FFMPEG = r"C:\Users\cliff\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
MAGICK = r"C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe"

DEFAULT_VOICE = "en-US-AndrewMultilingualNeural"
FPS = 30
WIDTH = 1280
HEIGHT = 720
DEFAULT_CROSSFADE = 0.4
DEFAULT_PAD_BEFORE = 0.5
DEFAULT_PAD_AFTER = 0.8

# Brand
PRODUCT_NAME = "Knowledge Horizon"
PRODUCT_URL = "knowledgehorizon.ai"
BRAND_COLOR = "#2563EB"  # Blue-600
BRAND_BG = "#0f172a"  # Slate-900

# ---------------------------------------------------------------------------
# Embedded storyboard (placeholder — use JSON storyboards for real demos)
# ---------------------------------------------------------------------------
EMBEDDED_SCENES = [
    {
        "frame": "01_landing.png",
        "narration": (
            "This is Knowledge Horizon. A research intelligence platform "
            "that keeps your team ahead of the science that matters."
        ),
    },
]
EMBEDDED_CLOSING = (
    "Knowledge Horizon. Stay ahead of the science that matters. "
    "Learn more at knowledge horizon dot A I."
)
EMBEDDED_TAGLINE = "Stay ahead of the science."
EMBEDDED_OUTPUT = "kh-demo.mp4"


# ---------------------------------------------------------------------------
# Storyboard loader
# ---------------------------------------------------------------------------
def load_storyboard(json_path=None):
    if json_path:
        with open(json_path) as f:
            return json.load(f)
    return {
        "output": EMBEDDED_OUTPUT,
        "voice": DEFAULT_VOICE,
        "crossfade": DEFAULT_CROSSFADE,
        "closing_narration": EMBEDDED_CLOSING,
        "closing_tagline": EMBEDDED_TAGLINE,
        "scenes": EMBEDDED_SCENES,
    }


# ---------------------------------------------------------------------------
# Audio generation (with sidecar text caching)
# ---------------------------------------------------------------------------
def _audio_needs_regen(mp3_path, narration_text):
    """Check if audio needs regeneration by comparing narration text."""
    txt_path = mp3_path.replace(".mp3", ".txt")
    if not os.path.exists(mp3_path) or not os.path.exists(txt_path):
        return True
    with open(txt_path, "r", encoding="utf-8") as f:
        return f.read() != narration_text


def _save_narration_text(mp3_path, narration_text):
    """Save narration text to sidecar file for cache validation."""
    txt_path = mp3_path.replace(".mp3", ".txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(narration_text)


async def generate_audio(scenes, closing_narration, voice):
    import edge_tts

    for i, scene in enumerate(scenes):
        out_path = os.path.join(AUDIO_DIR, f"{i:02d}.mp3")
        narration = scene["narration"]
        if not _audio_needs_regen(out_path, narration):
            print(f"  Audio {i:02d} unchanged, skipping")
            continue
        print(f"  Generating audio {i:02d}: {narration[:60]}...")
        comm = edge_tts.Communicate(narration, voice)
        await comm.save(out_path)
        _save_narration_text(out_path, narration)

    closing_path = os.path.join(AUDIO_DIR, "closing.mp3")
    if _audio_needs_regen(closing_path, closing_narration):
        print("  Generating closing audio...")
        comm = edge_tts.Communicate(closing_narration, voice)
        await comm.save(closing_path)
        _save_narration_text(closing_path, closing_narration)
    else:
        print("  Closing audio unchanged, skipping")

    # Clean up stale audio files (e.g., if scene count decreased)
    expected = {f"{i:02d}.mp3" for i in range(len(scenes))}
    expected.add("closing.mp3")
    expected_txt = {f.replace(".mp3", ".txt") for f in expected}
    for f in os.listdir(AUDIO_DIR):
        if f.endswith(".mp3") and f not in expected:
            print(f"  Removing stale audio: {f}")
            os.remove(os.path.join(AUDIO_DIR, f))
        if f.endswith(".txt") and f not in expected_txt:
            os.remove(os.path.join(AUDIO_DIR, f))


def get_audio_duration(path):
    ffprobe = FFMPEG.replace("ffmpeg.exe", "ffprobe.exe")
    result = subprocess.run(
        [ffprobe, "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True,
    )
    return float(result.stdout.strip())


# ---------------------------------------------------------------------------
# Closing frame
# ---------------------------------------------------------------------------
def create_closing_frame(tagline):
    out_path = os.path.join(FRAMES_DIR, "closing.png")
    print("  Creating closing frame...")
    subprocess.run([
        MAGICK, "-size", f"{WIDTH}x{HEIGHT}",
        f"xc:{BRAND_BG}",
        "-font", "Arial-Bold", "-pointsize", "48",
        "-fill", "white", "-gravity", "center",
        "-annotate", "+0-80", PRODUCT_NAME,
        "-font", "Arial", "-pointsize", "24",
        "-fill", BRAND_COLOR,
        "-annotate", "+0+0", tagline,
        "-pointsize", "20", "-fill", "#94a3b8",
        "-annotate", "+0+60", PRODUCT_URL,
        out_path,
    ], check=True)
    return out_path


# ---------------------------------------------------------------------------
# Zoompan expressions
# ---------------------------------------------------------------------------
def build_zoompan_expr(scene_idx, zoom_spec, total_frames):
    """Return (zoom_expr, x_expr, y_expr) for ffmpeg zoompan.

    zoom_spec=None  -> subtle Ken Burns (alternating push/pull)
    zoom_spec={...} -> dramatic hold-then-zoom toward a focal point
    """
    if zoom_spec is None:
        drift = 0.04
        if scene_idx % 2 == 0:
            z = f"1+{drift}*(on/{total_frames})"
        else:
            z = f"1+{drift}*(1-on/{total_frames})"
        x = "(iw-iw/zoom)/2"
        y = "(ih-ih/zoom)/2"
    else:
        zoom_to = zoom_spec["zoom_to"]
        cx = zoom_spec["center_x"] * WIDTH
        cy = zoom_spec["center_y"] * HEIGHT
        hold = int(total_frames * 0.35)
        prog = f"min(1,(on-{hold})/({total_frames}-{hold}))"
        z = (
            f"if(lt(on,{hold}),1,"
            f"1+({zoom_to}-1)*{prog}*{prog}*(3-2*{prog}))"
        )
        x = f"max(0,min({cx}-({WIDTH}/2)/zoom,iw-{WIDTH}/zoom))"
        y = f"max(0,min({cy}-({HEIGHT}/2)/zoom,ih-{HEIGHT}/zoom))"

    return z, x, y


# ---------------------------------------------------------------------------
# Video assembly
# ---------------------------------------------------------------------------
def build_video(all_scenes, output_path, crossfade):
    print("\n=== Building video ===")

    n = len(all_scenes)
    fade = crossfade

    durations = []
    for i, sc in enumerate(all_scenes):
        audio_dur = get_audio_duration(sc["audio_path"])
        pb = sc.get("pad_before", DEFAULT_PAD_BEFORE)
        pa = sc.get("pad_after", DEFAULT_PAD_AFTER)
        if i > 0:
            pb = max(pb, fade)
        if i < n - 1:
            pa = max(pa, fade)
        total = pb + audio_dur + pa
        durations.append(total)
        sc["_pb"] = pb
        tag = "zoom" if sc.get("zoom") else "drift"
        print(f"  Scene {i:02d}: {total:.1f}s ({tag})")

    total_duration = sum(durations) - max(0, n - 1) * fade
    print(f"  Total with {n-1} crossfades: {total_duration:.1f}s")

    inputs = []
    for sc in all_scenes:
        inputs.extend(["-i", sc["frame_path"]])
        inputs.extend(["-i", sc["audio_path"]])

    filters = []

    # 1. Zoompan per scene
    for i, sc in enumerate(all_scenes):
        v_in = i * 2
        nframes = int(durations[i] * FPS)
        ze, xe, ye = build_zoompan_expr(i, sc.get("zoom"), nframes)
        filters.append(
            f"[{v_in}:v]zoompan=z='{ze}':x='{xe}':y='{ye}'"
            f":d={nframes}:s={WIDTH}x{HEIGHT}:fps={FPS}[v{i}]"
        )

    # 2. Chain xfade for video
    if n == 1:
        filters.append("[v0]null[vout]")
    else:
        for j in range(n - 1):
            left = f"v{j}" if j == 0 else f"vx{j-1}"
            right = f"v{j+1}"
            out = "vout" if j == n - 2 else f"vx{j}"
            offset = sum(durations[: j + 1]) - (j + 1) * fade
            filters.append(
                f"[{left}][{right}]xfade=transition=fade"
                f":duration={fade}:offset={offset:.4f}[{out}]"
            )

    # 3. Pad each scene's audio to full scene duration
    for i, sc in enumerate(all_scenes):
        a_in = i * 2 + 1
        delay_ms = int(sc["_pb"] * 1000)
        dur = durations[i]
        filters.append(
            f"[{a_in}:a]adelay={delay_ms}|{delay_ms},"
            f"apad=whole_dur={dur:.4f},"
            f"atrim=0:{dur:.4f},"
            f"asetpts=PTS-STARTPTS[a{i}]"
        )

    # 4. Chain acrossfade for audio
    if n == 1:
        filters.append("[a0]anull[aout]")
    else:
        for j in range(n - 1):
            left = f"a{j}" if j == 0 else f"ax{j-1}"
            right = f"a{j+1}"
            out = "aout" if j == n - 2 else f"ax{j}"
            filters.append(
                f"[{left}][{right}]acrossfade=d={fade}"
                f":c1=tri:c2=tri[{out}]"
            )

    filter_str = ";\n".join(filters)
    filter_file = os.path.join(DEMO_DIR, "_filter.txt")
    with open(filter_file, "w") as f:
        f.write(filter_str)

    cmd = [
        FFMPEG, "-y",
        *inputs,
        "-filter_complex_script", filter_file,
        "-map", "[vout]",
        "-map", "[aout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "22",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-r", str(FPS),
        output_path,
    ]

    print(f"\n  Running ffmpeg ({n} scenes, {n-1} crossfades)...")
    result = subprocess.run(cmd, capture_output=True, text=True)

    try:
        os.remove(filter_file)
    except OSError:
        pass

    if result.returncode != 0:
        print(f"  FFMPEG ERROR:\n{result.stderr[-3000:]}")
        return False

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\n  Video created: {output_path}")
    print(f"  Duration: {total_duration:.0f}s | Size: {size_mb:.1f} MB")
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main():
    json_path = sys.argv[1] if len(sys.argv) > 1 else None
    sb = load_storyboard(json_path)

    scenes = sb["scenes"]
    voice = sb.get("voice", DEFAULT_VOICE)
    crossfade = sb.get("crossfade", DEFAULT_CROSSFADE)
    closing_narration = sb["closing_narration"]
    closing_tagline = sb.get("closing_tagline", "Stay ahead of the science.")
    output_name = sb.get("output", "kh-demo.mp4")
    output_path = os.path.join(DEMO_DIR, output_name)

    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(FRAMES_DIR, exist_ok=True)

    print("=== Step 1: Generate narration audio ===")
    await generate_audio(scenes, closing_narration, voice)

    print("\n=== Step 2: Create closing frame ===")
    closing_frame = create_closing_frame(closing_tagline)

    all_scenes = []
    for i, sc in enumerate(scenes):
        all_scenes.append({
            **sc,
            "frame_path": os.path.join(FRAMES_DIR, sc["frame"]),
            "audio_path": os.path.join(AUDIO_DIR, f"{i:02d}.mp3"),
        })
    all_scenes.append({
        "frame": "closing.png",
        "frame_path": closing_frame,
        "audio_path": os.path.join(AUDIO_DIR, "closing.mp3"),
        "pad_before": 0.5,
        "pad_after": 1.5,
    })

    print("\n=== Step 3: Assemble video ===")
    success = build_video(all_scenes, output_path, crossfade)

    print("\n=== DONE ===" if success else "\n=== FAILED ===")


if __name__ == "__main__":
    asyncio.run(main())
