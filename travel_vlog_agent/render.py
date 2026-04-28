from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .models import VlogPlan


@dataclass(slots=True)
class RenderArtifacts:
    concat_manifest: Path
    ffmpeg_command: str
    output_video: Path


@dataclass(slots=True)
class RenderPlanner:
    output_dir: Path

    def build(self, plan: VlogPlan) -> RenderArtifacts:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        manifest = self.output_dir / "timeline_concat.txt"
        output_video = self.output_dir / "travel_vlog_30min.mp4"
        lines: list[str] = []

        for segment in plan.segments:
            lines.extend(
                [
                    f"file '{segment.clip_path}'",
                    f"inpoint {segment.start_seconds:.3f}",
                    f"outpoint {segment.end_seconds:.3f}",
                ]
            )

        manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
        command = (
            "ffmpeg -y -f concat -safe 0 "
            f"-i \"{manifest}\" "
            "-vf \"scale='min(1920,iw)':-2,fps=30\" "
            "-c:v libx264 -preset medium -crf 20 "
            "-c:a aac -b:a 192k "
            f"\"{output_video}\""
        )
        return RenderArtifacts(
            concat_manifest=manifest,
            ffmpeg_command=command,
            output_video=output_video,
        )
