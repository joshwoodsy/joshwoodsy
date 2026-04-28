from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import AgentConfig
from .models import Clip

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".m4v", ".webm"}


@dataclass(slots=True)
class ClipDiscovery:
    config: AgentConfig

    def discover(self) -> list[Clip]:
        clips: list[Clip] = []
        if not self.config.clips_dir.exists():
            return clips

        for path in sorted(self.config.clips_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in VIDEO_EXTENSIONS:
                continue
            duration_seconds = probe_duration_seconds(path)
            score = score_clip(path, duration_seconds, self.config.travel_keywords)
            tags = extract_tags(path, self.config.travel_keywords)
            clips.append(
                Clip(
                    path=path,
                    duration_seconds=duration_seconds,
                    score=score,
                    tags=tags,
                )
            )
        return sorted(clips, key=lambda clip: clip.score, reverse=True)


def probe_duration_seconds(path: Path) -> float:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    try:
        output = subprocess.check_output(command, stderr=subprocess.STDOUT, text=True)
        value = float(output.strip())
        if value > 0:
            return value
    except (OSError, subprocess.CalledProcessError, ValueError):
        pass
    guessed = parse_duration_from_filename(path.name)
    if guessed is not None:
        return guessed
    # Last-resort heuristic: 1MB ~= 4 seconds for compressed travel footage.
    size_mb = max(1.0, path.stat().st_size / (1024 * 1024))
    return round(size_mb * 4.0, 2)


def parse_duration_from_filename(name: str) -> float | None:
    match = re.search(r"(\d{1,4})s", name.lower())
    if not match:
        return None
    value = float(match.group(1))
    return value if value > 0 else None


def extract_tags(path: Path, keywords: tuple[str, ...]) -> list[str]:
    lowered = path.name.lower()
    return [keyword for keyword in keywords if keyword in lowered]


def score_clip(path: Path, duration_seconds: float, keywords: tuple[str, ...]) -> float:
    score = 1.0
    lowered = path.name.lower()

    for keyword in keywords:
        if keyword in lowered:
            score += 1.25

    if 8 <= duration_seconds <= 45:
        score += 1.0
    elif duration_seconds < 4:
        score -= 0.5
    elif duration_seconds > 180:
        score += 0.4

    if any(token in lowered for token in ("timelapse", "drone", "broll", "b-roll")):
        score += 0.8
    if any(token in lowered for token in ("blurry", "shake", "test")):
        score -= 1.0

    return round(max(0.1, score), 3)
