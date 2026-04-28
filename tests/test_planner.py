from travel_vlog_agent.config import AgentConfig
from travel_vlog_agent.models import Clip
from travel_vlog_agent.planner import TimelinePlanner, ideal_segment_duration


def test_ideal_segment_duration_bounds() -> None:
    assert ideal_segment_duration(2, min_seconds=5, max_seconds=30) == 5.0
    assert ideal_segment_duration(10, min_seconds=5, max_seconds=30) == 10
    assert ideal_segment_duration(120, min_seconds=5, max_seconds=30) == 30


def test_timeline_planner_builds_segments_for_target() -> None:
    config = AgentConfig.from_dict(
        {
            "clips_dir": ".",
            "output_dir": ".",
            "target_minutes": 30,
            "min_segment_seconds": 5,
            "max_segment_seconds": 30,
            "travel_keywords": ["beach", "city"],
        }
    )
    clips = [
        Clip(path=config.clips_dir / f"clip_{idx}.mp4", duration_seconds=24, score=2.0)
        for idx in range(120)
    ]
    plan = TimelinePlanner(config).build(clips)
    assert len(plan.segments) > 0
    assert plan.estimated_duration_seconds >= 1400
    assert plan.target_duration_seconds == 1800
