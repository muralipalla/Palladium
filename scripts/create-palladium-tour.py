"""Render Palladium's 32-second portrait tour from real browser captures.

Requires Pillow, NumPy and FFmpeg. Use --captures DIR to import full-page
screenshots and their DOM crop metadata, then rerun without it to rebuild.
Music is synthesised here; no stock audio or generated website imagery is used.
"""

import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "assets" / "videos"
SOURCES = MEDIA / "palladium-tour-source"
W, H, FPS, DURATION = 1080, 1920, 30, 32
NAVY = (6, 17, 36)
WHITE = (243, 248, 255)
MUTED = (167, 190, 215)
CYAN = (99, 224, 244)
PURPLE = (185, 154, 255)
GREEN = (96, 230, 182)


def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts") / ("segoeuib.ttf" if bold else "segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu") / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"),
    ]
    return ImageFont.truetype(str(next(p for p in candidates if p.exists())), size)


FONTS = {(s, b): font(s, b) for s in [21, 24, 27, 30, 32, 38, 42, 48, 58, 76, 84, 90, 104, 156] for b in [False, True]}


def import_captures(directory):
    SOURCES.mkdir(parents=True, exist_ok=True)
    for name in ["home", "solar"]:
        crop_capture(directory, name, name)
    for name in ["pursuit", "atom", "quiz", "quiz-hint", "vectors", "vocabulary"]:
        crop_capture(directory, name, name)
    for n in range(17):
        crop_capture(directory, f"coin-{n:02d}", "coin")


def crop_capture(directory, name, metadata_name):
    meta = json.loads((directory / f"{metadata_name}-meta.json").read_text())
    source = Image.open(directory / f"{name}-full.jpg").convert("RGB")
    # This capture host returns CSS-pixel page content with extra image padding.
    # JPEG width therefore cannot be used to infer the content's pixel scale.
    scale = meta.get("pixelScale", 1)
    box = tuple(round(v * scale) for v in [meta["x"], meta["y"], meta["x"] + meta["width"], meta["y"] + meta["height"]])
    source.crop(box).save(SOURCES / f"{name}.jpg", quality=93)


def background():
    yy, xx = np.mgrid[0:H, 0:W]
    glow_a = np.exp(-(((xx - 1000) / 700) ** 2 + ((yy - 440) / 850) ** 2))
    glow_b = np.exp(-(((xx - 80) / 650) ** 2 + ((yy - 1500) / 700) ** 2))
    pixels = np.zeros((H, W, 3), dtype=np.float32)
    for c, base in enumerate(NAVY):
        pixels[:, :, c] = base + glow_a * [7, 24, 37][c] + glow_b * [19, 8, 34][c]
    image = Image.fromarray(np.clip(pixels, 0, 255).astype("uint8"))
    draw = ImageDraw.Draw(image)
    for y in range(96, H, 64):
        for x in range(36, W, 64):
            draw.ellipse((x, y, x + 2, y + 2), fill=(34, 57, 77))
    for offset in [0, 90, 180]:
        draw.ellipse((-360 - offset, 750 - offset, 1390 + offset, 1740 + offset), outline=(27, 47, 70), width=2)
    return image


BG = background()
IMAGES = {}


def image(name):
    if name not in IMAGES:
        IMAGES[name] = Image.open(SOURCES / f"{name}.jpg").convert("RGB")
    return IMAGES[name]


def text(draw, xy, content, size, color=WHITE, bold=False):
    draw.text(xy, content, font=FONTS[size, bold], fill=color)


def logo(draw, x, y, size=82):
    draw.rounded_rectangle((x, y, x + size, y + size), radius=20, fill=(63, 75, 183), outline=(123, 205, 246), width=2)
    draw.ellipse((x - 10, y + size * .25, x + size + 10, y + size * .72), outline=CYAN, width=2)
    text(draw, (x + 11, y + 5), "46", 21)
    text(draw, (x + 12, y + 20), "Pd", 42, bold=True)


def brand(draw):
    logo(draw, 82, 142)
    text(draw, (190, 143), "Palladium", 48, bold=True)
    text(draw, (193, 205), "EXPLORE  /  PRACTISE  /  LEVEL UP", 21, MUTED)


def screen_card(canvas, source, t, rect=(78, 744, 1002, 1558)):
    x1, y1, x2, y2 = rect
    width, height = x2 - x1, y2 - y1
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x1 - 3, y1 - 3, x2 + 3, y2 + 3), radius=30, fill=(25, 49, 74), outline=(54, 88, 115), width=2)
    inner = Image.new("RGB", (width, height), (10, 25, 44))
    # Preserve the real interface's proportions and fit the entire capture.
    fit = ImageOps.contain(source, (width - 26, height - 40), Image.Resampling.LANCZOS)
    ease = 1 - (1 - min(t / 4, 1)) ** 3
    scale = 1 + .022 * ease
    fit = fit.resize((round(fit.width * scale), round(fit.height * scale)), Image.Resampling.BICUBIC)
    inner.paste(fit, ((width - fit.width) // 2, (height - fit.height) // 2 - round(5 * math.sin(t))))
    mask = Image.new("L", inner.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width, height), radius=27, fill=255)
    canvas.paste(inner, (x1, y1), mask)


SCENES = [
    ("MEET YOUR NEXT AHA!", ["Curiosity", "starts here."], ["A little wonder. A lot to explore."], "solar", CYAN, "QUIZZES  /  SIMULATIONS  /  SELF PRACTICE"),
    ("PHYSICS PUZZLES", ["Predict it.", "Then test it."], ["The coin paradox. See it for yourself."], "coin-00", CYAN, "ROLL  /  OBSERVE  /  REPEAT"),
    ("THE PURSUIT PROBLEM", ["Follow your", "curiosity."], ["Every target moves. What happens next?"], "pursuit", PURPLE, "CHANGE THE CONTROLS. EXPLORE THE RESULT."),
    ("CHEMISTRY IN MOTION", ["Make science", "visible."], ["Explore atomic models at your own pace."], "atom", GREEN, "INTERACTIVE MODELS  /  SCHEMATIC VIEWS"),
    ("GUIDED PRACTICE", ["A challenge.", "A little guidance."], ["Choose topics. Reveal hints.", "Check the explanation."], "quiz", CYAN, "PHYSICS  /  EQUATIONS OF MOTION"),
    ("MATHS, ONE STEP AT A TIME", ["Build your", "maths muscles."], ["Vectors, matrices and more."], "vectors", PURPLE, "CHOOSE A SKILL. GIVE IT A GO."),
    ("FIND YOUR NEXT GREAT WORD", ["Make every", "word count."], ["Meaning, context and word relations."], "vocabulary", GREEN, "VOCABULARY  /  DAILY PRACTICE"),
    ("BUILT FOR CURIOUS MINDS", ["Explore. Practise.", "Level up."], ["Physics. Chemistry. Maths. English."], "home", CYAN, "START EXPLORING TODAY"),
]


def scene(index, local):
    canvas = BG.copy()
    draw = ImageDraw.Draw(canvas)
    category, headline, copy, shot, accent, footnote = SCENES[index]
    brand(draw)
    rise = round(24 * (1 - min(1, local / .65)) ** 3)
    text(draw, (84, 307 + rise), category, 24, accent, True)
    for line, value in enumerate(headline):
        # Long closing and guidance lines use a smaller font, never clipping.
        size = 84 if len(value) > 14 else 90
        assert draw.textbbox((0, 0), value, font=FONTS[size, True])[2] <= 922, value
        text(draw, (78, 363 + line * 116 + rise), value, size, bold=True)
    for line, value in enumerate(copy):
        text(draw, (84, 615 + line * 47 + rise), value, 32, MUTED)

    if index == 1:
        shot = f"coin-{min(16, int(local / 3.7 * 17)):02d}"
    if index == 4 and local > 1.85:
        shot = "quiz-hint"
    if index == 7:
        # The actual homepage appears beneath the final, readable call to action.
        screen_card(canvas, image("home"), local, (78, 775, 1002, 1230))
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle((84, 1315, 996, 1468), radius=25, fill=(42, 101, 201), outline=(108, 188, 250), width=2)
        text(draw, (132, 1332), "VISIT PALLADIUM", 38, bold=True)
        text(draw, (132, 1394), "muralipalla.github.io/Palladium", 38)
    else:
        screen_card(canvas, image(shot), local)

    draw = ImageDraw.Draw(canvas)
    text(draw, (84, 1611), footnote, 24, accent, True)
    for segment in range(8):
        left = 84 + segment * 115
        draw.rounded_rectangle((left, 1690, left + 100, 1696), radius=3, fill=(44, 64, 85))
        if segment < index:
            draw.rounded_rectangle((left, 1690, left + 100, 1696), radius=3, fill=accent)
        elif segment == index:
            draw.rounded_rectangle((left, 1690, left + max(1, int(100 * local / 4)), 1696), radius=3, fill=accent)
    text(draw, (84, 1738), "PALLADIUM  /  YOUR NEXT AHA! MOMENT", 21, MUTED)
    return canvas


def frame_at(t):
    index = min(7, int(t / 4))
    local = t - index * 4
    canvas = scene(index, local)
    if index and local < .24:
        canvas = Image.blend(scene(index - 1, 3.99), canvas, local / .24)
    if t < .3:
        canvas = Image.blend(Image.new("RGB", (W, H), NAVY), canvas, t / .3)
    if t > DURATION - .45:
        canvas = Image.blend(canvas, Image.new("RGB", (W, H), NAVY), (t - DURATION + .45) / .45)
    return canvas


def soundtrack(destination):
    rate = 48000
    signal = np.zeros((rate * DURATION, 2), np.float64)
    chords = [[52, 55, 59, 64], [48, 52, 55, 60], [43, 47, 50, 55], [50, 54, 57, 62]]

    def note(start, duration, midi, volume, pan=0, pluck=False):
        at = int(start * rate)
        length = min(int(duration * rate), len(signal) - at)
        if length <= 0:
            return
        t = np.arange(length) / rate
        hz = 440 * 2 ** ((midi - 69) / 12)
        sound = np.sin(2 * np.pi * hz * t) + .18 * np.sin(4 * np.pi * hz * t)
        envelope = (1 - np.exp(-t * 35)) * np.minimum(1, (duration - t) / .18)
        if pluck:
            envelope *= np.exp(-t * 5)
        sound *= envelope * volume
        signal[at:at + length, 0] += sound * math.sqrt((1 - pan) / 2)
        signal[at:at + length, 1] += sound * math.sqrt((1 + pan) / 2)

    for bar in range(16):
        chord = chords[(bar // 2) % len(chords)]
        for n in chord:
            note(bar * 2, 2.05, n, .032, (n % 3 - 1) * .25)
        for beat in range(4):
            note(bar * 2 + beat * .5, .45, chord[0] - 12, .07, pluck=True)
        for step in range(8):
            note(bar * 2 + step * .25, .46, chord[[0, 2, 1, 3, 2, 1, 3, 2][step]] + 12, .047, (-1) ** step * .3, True)
    time = np.arange(len(signal)) / rate
    signal *= (np.minimum(1, time / .8) * np.minimum(1, (DURATION - time) / 1.4))[:, None]
    signal = np.tanh(signal * 1.5) * .66
    with wave.open(str(destination), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes((signal * 32767).astype("<i2").tobytes())


def previews():
    MEDIA.mkdir(parents=True, exist_ok=True)
    frames = [frame_at(n * 4 + 2) for n in range(8)]
    frames[0].save(MEDIA / "palladium-tour-poster.jpg", quality=92)
    contact = Image.new("RGB", (1080, 960), NAVY)
    for n, frame in enumerate(frames):
        contact.paste(frame.resize((270, 480), Image.Resampling.LANCZOS), ((n % 4) * 270, (n // 4) * 480))
    contact.save(MEDIA / "palladium-tour-storyboard.jpg", quality=94)
    social = Image.new("RGB", (1200, 630), NAVY)
    draw = ImageDraw.Draw(social)
    logo(draw, 60, 56)
    text(draw, (170, 60), "Palladium", 48, bold=True)
    text(draw, (60, 215), "Your next", 84, bold=True)
    text(draw, (60, 315), "aha! moment.", 84, CYAN, True)
    text(draw, (64, 476), "WATCH THE 32-SECOND TOUR", 27, MUTED, True)
    small = ImageOps.contain(image("solar"), (445, 465), Image.Resampling.LANCZOS)
    social.paste(small, (730, 125))
    social.save(MEDIA / "palladium-tour-social.jpg", quality=94)


def render():
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg is required to encode the tour")
    with tempfile.TemporaryDirectory(prefix="palladium-tour-") as directory:
        music = Path(directory) / "original-music.wav"
        soundtrack(music)
        with (Path(directory) / "encode.log").open("wb") as log:
            args = [ffmpeg, "-y", "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", f"{W}x{H}", "-framerate", str(FPS), "-i", "pipe:0", "-i", str(music), "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-maxrate", "5M", "-bufsize", "10M", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level:v", "4.0", "-threads", "4", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "-t", str(DURATION), "-shortest", str(MEDIA / "palladium-tour.mp4")]
            process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
            try:
                for frame in range(FPS * DURATION):
                    process.stdin.write(frame_at(frame / FPS).tobytes())
                    if frame % (FPS * 4) == 0:
                        print(f"Rendered {frame // FPS}/{DURATION} seconds", flush=True)
                process.stdin.close()
                code = process.wait()
            except BaseException:
                process.kill()
                process.wait()
                raise
        if code:
            raise RuntimeError((Path(directory) / "encode.log").read_text(errors="replace")[-5000:])
    print(f"Ready: {MEDIA / 'palladium-tour.mp4'}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--captures", type=Path)
    parser.add_argument("--preview-only", action="store_true")
    options = parser.parse_args()
    if options.captures:
        import_captures(options.captures)
    previews()
    if not options.preview_only:
        render()
