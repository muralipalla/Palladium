# Palladium website tour

The public video is `palladium-tour.mp4`: 32 seconds, 1080 × 1920, 30 fps,
H.264 video and AAC stereo audio. It has a fast-start MP4 layout for web playback.
The audio is an original instrumental composition synthesised by the renderer.
The text is burned into the video; an English caption track and a watch-page
transcript are also provided.

`palladium-tour-source/` contains cropped browser captures of the actual site,
captured on 21 November 2026. The coin sequence uses the site's own simulation
frames. Camera movement and transitions are editorial effects; the video does
not claim to show elapsed physical time. Atomic views are labelled schematic.
Question prompts, choices, and models were not recreated with generative imagery.

Rebuild from the saved captures with Pillow, NumPy, and FFmpeg installed:

```text
python scripts/create-palladium-tour.py
```

Run `--preview-only` to regenerate the poster, social image and storyboard.
To update the captures, `--captures DIR` accepts full-page JPEGs plus the crop
metadata used by `import_captures` in the script. The capture pixel scale defaults
to 1, or can be specified as `pixelScale` in each metadata file.

The homepage's social links share `https://muralipalla.github.io/Palladium/tour.html`,
whose metadata points to this MP4 and its social preview. Browser share links on
LinkedIn, Facebook and X share the watch page; their preview and playback choices
remain platform-controlled. Instagram has download and native file-sharing options.
Native sharing deliberately uses two clicks: first prepare the MP4, then share it
from a fresh user gesture. Its payload contains the video file, without a URL.
Visitors finish posting in their chosen app. Unsupported devices keep the direct
MP4 download and Instagram link.
