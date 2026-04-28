from pathlib import Path

from travel_vlog_agent.discovery import (
    extract_tags,
    parse_duration_from_filename,
    score_clip,
)


def test_parse_duration_from_filename() -> None:
    assert parse_duration_from_filename("beach_45s.mp4") == 45.0
    assert parse_duration_from_filename("city_walk.mov") is None


def test_extract_tags_and_scoring() -> None:
    path = Path("sunset_beach_drone_12s.mp4")
    keywords = ("sunset", "beach", "mountain")
    tags = extract_tags(path, keywords)
    assert tags == ["sunset", "beach"]
    assert score_clip(path, 12.0, keywords) > 3.0
