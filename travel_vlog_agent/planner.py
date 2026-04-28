from __future__ import annotations

from dataclasses import dataclass

from .config import AgentConfig
from .models import Clip, Segment, VlogPlan


@dataclass(slots=True)
class TimelinePlanner:
    config: AgentConfig

    def build(self, clips: list[Clip]) -> VlogPlan:
        target_seconds = self.config.target_minutes * 60
        segments: list[Segment] = []
        running_total = 0.0

        if not clips:
            return VlogPlan(
                target_duration_seconds=target_seconds,
                estimated_duration_seconds=0.0,
                segments=[],
                notes=["No clips found in clips_dir."],
            )

        # Intro and outro reservation keeps enough room for narrative structure.
        reserved_intro_outro = 90
        effective_target = max(60, target_seconds - reserved_intro_outro)

        for clip in clips:
            if running_total >= effective_target:
                break
            segment_duration = ideal_segment_duration(
                clip.duration_seconds,
                min_seconds=self.config.min_segment_seconds,
                max_seconds=self.config.max_segment_seconds,
            )
            remaining = max(0.0, effective_target - running_total)
            use_seconds = min(segment_duration, remaining)
            if use_seconds < self.config.min_segment_seconds:
                continue

            reason = "high-scoring travel highlight"
            if clip.tags:
                reason += f" ({', '.join(clip.tags[:3])})"
            segments.append(
                Segment(
                    clip_path=clip.path,
                    start_seconds=0.0,
                    end_seconds=round(use_seconds, 3),
                    reason=reason,
                )
            )
            running_total += use_seconds

        # Fallback pass if we under-filled: re-use the strongest clips with offset cuts.
        if running_total < effective_target * 0.85 and segments:
            for clip in clips[: min(20, len(clips))]:
                if running_total >= effective_target:
                    break
                max_start = max(0.0, clip.duration_seconds - self.config.max_segment_seconds)
                start = round(min(max_start, clip.duration_seconds * 0.35), 3)
                remaining = max(0.0, effective_target - running_total)
                use_seconds = min(self.config.max_segment_seconds, remaining)
                if use_seconds < self.config.min_segment_seconds:
                    continue
                segments.append(
                    Segment(
                        clip_path=clip.path,
                        start_seconds=start,
                        end_seconds=round(start + use_seconds, 3),
                        reason="secondary cut to reach target runtime",
                    )
                )
                running_total += use_seconds

        final_estimate = min(target_seconds, running_total + reserved_intro_outro)
        notes = [
            f"Generated {len(segments)} timeline segments.",
            "Reserve ~45s intro and ~45s outro for talking head, map, or recap.",
            "Add music ducking around spoken segments before publishing.",
        ]
        if final_estimate < target_seconds * 0.8:
            notes.append("Runtime under target: capture more clips or reduce segment filters.")

        return VlogPlan(
            target_duration_seconds=target_seconds,
            estimated_duration_seconds=round(final_estimate, 3),
            segments=segments,
            notes=notes,
        )


def ideal_segment_duration(
    clip_duration: float,
    *,
    min_seconds: int,
    max_seconds: int,
) -> float:
    if clip_duration <= min_seconds:
        return float(min_seconds)
    if clip_duration <= max_seconds:
        return clip_duration
    # Pull a strong middle value so average pacing stays dynamic.
    return round(min(max_seconds, max(min_seconds, clip_duration * 0.4)), 3)
