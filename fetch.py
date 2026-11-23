#!/usr/bin/env python3
"""Pull Texas DMV automated-vehicle roster for Tesla and track Cybercab counts.
Stdlib only. Writes data/latest.json, data/history.json, data/vins.json."""
import json, os, sys, time, urllib.request
from datetime import datetime, timezone

API = ("https://txmccs.txdmv.gov/api/TruckStop/companies/"
       "81edcff1-8a6e-4ed0-be1f-60668515e223/automated-motor-vehicles")
SOURCE_PAGE = "https://txmccs.txdmv.gov/"
LIMIT = 100
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
PREFIXES = {"cybercab": "5YJAJEEU", "modely": "7SAYGDEE"}


def classify(vin):
    for k, p in PREFIXES.items():
        if vin.upper().startswith(p):
            return k
    return "other"


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "cybercab-tracker/1.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def fetch_all():
    vins, offset, total = [], 0, None
    while True:
        d = get(f"{API}?limit={LIMIT}&offset={offset}")
        page = [v["vin"] for v in d.get("vehicles", []) if v.get("vin")]
        total = d.get("total", total)
        vins += page
        offset += LIMIT
        if not page or (total is not None and offset >= total):
            break
    # de-dupe, keep order
    seen, out = set(), []
    for v in vins:
        if v not in seen:
            seen.add(v); out.append(v)
    return out, total


def load(name, default):
    p = os.path.join(DATA, name)
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return default


def save(name, obj):
    p = os.path.join(DATA, name)
    with open(p + ".tmp", "w") as f:
        json.dump(obj, f, indent=1)
    os.replace(p + ".tmp", p)


def main():
    os.makedirs(DATA, exist_ok=True)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    vins, total = fetch_all()
    if not vins:
        print("No VINs returned; aborting without writing.", file=sys.stderr)
        sys.exit(1)

    known = load("vins.json", {})          # vin -> {type, first_seen}
    first_run = not known
    added = []
    for v in vins:
        if v not in known:
            known[v] = {"type": classify(v), "first_seen": now, "initial": first_run}
            if not first_run:
                added.append(v)
    save("vins.json", known)

    counts = {"cybercab": 0, "modely": 0, "other": 0}
    for v in vins:
        counts[classify(v)] += 1
    counts["total"] = len(vins)

    latest = {
        "checked_at": now,
        "source": API,
        "api_total": total,
        "counts": counts,
        "added_this_run": added,
        "vehicles": [{"vin": v, "type": known[v]["type"], "first_seen": known[v]["first_seen"],
                      "initial": known[v].get("initial", False)} for v in vins],
    }
    save("latest.json", latest)

    hist = load("history.json", [])
    from datetime import datetime as _dt
    from zoneinfo import ZoneInfo as _Z
    ct_day = lambda iso: _dt.fromisoformat(iso.replace("Z", "+00:00")).astimezone(_Z("America/Chicago")).date()
    last = next((h for h in reversed(hist) if not h.get("backfilled")), None)
    point = {"t": now, **counts}
    # only append when counts change or >= 1 point per day, to keep file small
    if (last is None or any(last.get(k) != counts[k] for k in counts)
            or ct_day(last["t"]) != ct_day(now)):
        hist.append(point)
    else:
        last["t_checked"] = now
    hist.sort(key=lambda h: h["t"])
    save("history.json", hist)
    print(f"{now}  cybercab={counts['cybercab']} modely={counts['modely']} "
          f"other={counts['other']} total={counts['total']} (api total {total}) new={len(added)}")


if __name__ == "__main__":
    main()
