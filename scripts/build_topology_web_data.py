import argparse
import csv
import gzip
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path


def number_or_none(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def normalize_name(value):
    return re.sub(r"[\s\-‐‑‒–—―・·()（）\[\]【】]", "", str(value or "").lower())


def distance_km(lat1, lon1, lat2, lon2):
    dlat = (lat1 - lat2) * 111.0
    dlon = (lon1 - lon2) * 111.0 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dlat, dlon)


def facility_kind(node_type):
    return "substation" if node_type == "substation" else "generation"


def build_facility_index(payload):
    facilities = [*(payload.get("substations") or []), *(payload.get("generation") or [])]
    grid = defaultdict(list)
    for facility in facilities:
        try:
            lat = float(facility["lat"])
            lon = float(facility["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        facility["_lat"] = lat
        facility["_lon"] = lon
        facility["_names"] = [
            name
            for name in (
                normalize_name(facility.get("name_zh")),
                normalize_name(facility.get("name_ja")),
                normalize_name(facility.get("short_name")),
            )
            if len(name) >= 3
        ]
        grid[(math.floor(lat * 100), math.floor(lon * 100))].append(facility)
    return grid


def match_facility(row, facility_grid):
    lat = float(row["lat"])
    lon = float(row["lon"])
    kind = facility_kind(row["node_type"])
    names = [
        name
        for name in (normalize_name(row.get("name_zh")), normalize_name(row.get("name_ja")))
        if len(name) >= 3
    ]
    gy, gx = math.floor(lat * 100), math.floor(lon * 100)
    candidates = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for facility in facility_grid.get((gy + dy, gx + dx), []):
                if facility.get("facility_type") != kind:
                    continue
                distance = distance_km(lat, lon, facility["_lat"], facility["_lon"])
                if distance > 0.3:
                    continue
                name_match = any(
                    node_name in facility_name or facility_name in node_name
                    for node_name in names
                    for facility_name in facility["_names"]
                )
                if name_match or distance <= 0.05:
                    candidates.append((0 if name_match else 1, distance, facility))
    if not candidates:
        return None, ""
    candidates.sort(key=lambda item: (item[0], item[1]))
    name_rank, _, facility = candidates[0]
    return facility, "name_and_distance" if name_rank == 0 else "coordinate_exact"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--nodes", type=Path, required=True)
    parser.add_argument("--edges", type=Path, required=True)
    parser.add_argument("--quality", type=Path, required=True)
    parser.add_argument("--facilities", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    args = parser.parse_args()

    with args.facilities.open("r", encoding="utf-8") as handle:
        facility_grid = build_facility_index(json.load(handle))
    with args.quality.open("r", encoding="utf-8") as handle:
        quality = json.load(handle)

    nodes = []
    methods = Counter()
    matched_with_metadata = 0
    with args.nodes.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            linked, method = match_facility(row, facility_grid)
            linked_id = linked.get("node_id") if linked else ""
            if linked:
                methods[method] += 1
                if int(linked.get("metadata_count") or 0) > 0:
                    matched_with_metadata += 1
            nodes.append(
                [
                    row["node_id"],
                    round(float(row["lon"]), 5),
                    round(float(row["lat"]), 5),
                    row["node_type"],
                    row.get("name_zh") or row.get("name_ja") or "",
                    int(row.get("attached") or 0),
                    int(row.get("official_confirmed") or 0),
                    row.get("name_ja") or "",
                    row.get("name_zh") or "",
                    row.get("operator") or "",
                    row.get("energy_type") or "",
                    number_or_none(row.get("capacity_mw")),
                    number_or_none(row.get("max_voltage_kv")),
                    row.get("mesh_id") or "",
                    int(row.get("review_required") or 0),
                    row.get("physical_component_id") or "",
                    linked_id,
                    method,
                ]
            )

    edges = []
    with args.edges.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            edges.append([row["source"], row["target"], row["edge_type"]])

    link_summary = {
        "matched_nodes": sum(methods.values()),
        "matched_with_metadata": matched_with_metadata,
        "methods": dict(methods),
    }
    quality["web_attribute_links"] = link_summary
    payload = {"nodes": nodes, "edges": edges, "quality": quality}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(args.output, "wt", encoding="utf-8", compresslevel=9) as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    args.summary.write_text(json.dumps(link_summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(link_summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
