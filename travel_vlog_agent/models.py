from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class Clip:
    path: Path
    duration_seconds: float
    score: float
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": str(self.path),
            "duration_seconds": round(self.duration_seconds, 3),
            "score": round(self.score, 3),
            "tags": self.tags,
        }


@dataclass(slots=True)
class Segment:
    clip_path: Path
    start_seconds: float
    end_seconds: float
    reason: str

    @property
    def duration_seconds(self) -> float:
        return max(0.0, self.end_seconds - self.start_seconds)

    def to_dict(self) -> dict[str, Any]:
        return {
            "clip_path": str(self.clip_path),
            "start_seconds": round(self.start_seconds, 3),
            "end_seconds": round(self.end_seconds, 3),
            "duration_seconds": round(self.duration_seconds, 3),
            "reason": self.reason,
        }


@dataclass(slots=True)
class VlogPlan:
    target_duration_seconds: int
    estimated_duration_seconds: float
    segments: list[Segment]
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "target_duration_seconds": self.target_duration_seconds,
            "estimated_duration_seconds": round(self.estimated_duration_seconds, 3),
            "segments": [segment.to_dict() for segment in self.segments],
            "notes": self.notes,
        }
