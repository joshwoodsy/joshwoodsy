from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class AgentConfig:
    clips_dir: Path
    output_dir: Path
    target_minutes: int = 30
    min_segment_seconds: int = 5
    max_segment_seconds: int = 30
    travel_keywords: tuple[str, ...] = (
        "sunrise",
        "sunset",
        "beach",
        "food",
        "market",
        "street",
        "hike",
        "mountain",
        "city",
        "train",
        "airplane",
    )
    youtube_title_template: str = "Travel Vlog: {trip_name} ({episode_date})"
    youtube_privacy_status: str = "private"

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "AgentConfig":
        return cls(
            clips_dir=Path(payload["clips_dir"]).expanduser().resolve(),
            output_dir=Path(payload["output_dir"]).expanduser().resolve(),
            target_minutes=int(payload.get("target_minutes", 30)),
            min_segment_seconds=int(payload.get("min_segment_seconds", 5)),
            max_segment_seconds=int(payload.get("max_segment_seconds", 30)),
            travel_keywords=tuple(payload.get("travel_keywords", cls.travel_keywords)),
            youtube_title_template=str(
                payload.get("youtube_title_template", cls.youtube_title_template)
            ),
            youtube_privacy_status=str(
                payload.get("youtube_privacy_status", cls.youtube_privacy_status)
            ),
        )

    @classmethod
    def from_file(cls, path: Path) -> "AgentConfig":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls.from_dict(data)

    def to_dict(self) -> dict[str, Any]:
        return {
            "clips_dir": str(self.clips_dir),
            "output_dir": str(self.output_dir),
            "target_minutes": self.target_minutes,
            "min_segment_seconds": self.min_segment_seconds,
            "max_segment_seconds": self.max_segment_seconds,
            "travel_keywords": list(self.travel_keywords),
            "youtube_title_template": self.youtube_title_template,
            "youtube_privacy_status": self.youtube_privacy_status,
        }

    @staticmethod
    def template() -> dict[str, Any]:
        return {
            "clips_dir": "./clips",
            "output_dir": "./output",
            "target_minutes": 30,
            "min_segment_seconds": 5,
            "max_segment_seconds": 30,
            "travel_keywords": [
                "sunrise",
                "sunset",
                "beach",
                "food",
                "market",
                "street",
                "hike",
                "mountain",
                "city",
                "train",
                "airplane",
            ],
            "youtube_title_template": "Travel Vlog: {trip_name} ({episode_date})",
            "youtube_privacy_status": "private",
        }
