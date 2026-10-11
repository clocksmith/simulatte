"""Project the published Sun Trip spreadsheet into bounded reference measurements."""
import argparse
import hashlib
import json
import pathlib
import re
import statistics
import xml.etree.ElementTree as ET
import zipfile

root = pathlib.Path(__file__).resolve().parents[2]
source = root / "tools/simulatte/data/sun-trip-2021.ods"
output = root / "public/data/solar-drive/published-ride-reference-v1.json"
ns = {"t": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
      "o": "urn:oasis:names:tc:opendocument:xmlns:office:1.0"}
document = ET.fromstring(zipfile.ZipFile(source).read("content.xml"))
rows = []
for row in document.findall(".//t:table", ns)[0].findall("t:table-row", ns):
    cells = []
    for cell in row.findall("t:table-cell", ns):
        value = cell.get("{" + ns["o"] + "}value", " ".join(cell.itertext()).strip())
        count = min(20, int(cell.get("{" + ns["t"] + "}number-columns-repeated", "1")))
        cells.extend([value] * count)
    if not cells or not re.fullmatch(r"\d{2}-\d{2}", cells[0]):
        continue
    try:
        values = [float(cells[i]) for i in [2, 3, 4, 5, 6, 7]]
    except (ValueError, IndexError):
        continue
    if values[0] <= 0 or not all(0 <= v < 100000 for v in values):
        raise ValueError("Unsupported recorded ride row")
    rows.append(dict(date="2021-" + cells[0][3:] + "-" + cells[0][:2], route=cells[1],
                     distanceKm=values[0], ascentM=values[1], averageKph=values[2],
                     consumptionWh=values[3], consumptionWhKm=values[4], solarWh=values[5]))
if len(rows) < 20:
    raise ValueError("Missing published ride population")
data = dict(schema="simulatte.solarRideReference.v1", id="sun-trip-stephane-bujadoux-2021",
            source=dict(url="https://www.thesuntrip.com/les-donnees-du-tour-deurope-2021-de-stephane-bujadoux/",
                        download="https://www.thesuntrip.com/wp-content/uploads/2022/04/st2021-europe-stephanep-bujadoux.ods",
                        sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                        status="Published historical ride measurements; not independently remeasured"),
            configuration=dict(panelRatedW=500, batteryWh=1080, unloadedVehicleKg=60, motor="NineContinent FH212",
                               form="Recumbent bicycle and solar trailer"),
            rows=rows, split=dict(developmentDates=[r["date"] for r in rows[::2]],
                                 evaluationDates=[r["date"] for r in rows[1::2]],
                                 calibration="None. No simulation parameter was fit to these measurements."),
            summary=dict(count=len(rows), medianWhKm=statistics.median(r["consumptionWhKm"] for r in rows),
                         minWhKm=min(r["consumptionWhKm"] for r in rows), maxWhKm=max(r["consumptionWhKm"] for r in rows)),
            limits=["Different route, riding style, terrain, weather and vehicle geometry from the NYC simulation.",
                    "Daily aggregates do not provide a synchronized measured speed/power trajectory.",
                    "Reference size parameters are used approximately; efficiency, payload and aerodynamic parameters remain assumptions.",
                    "Numerical energy conservation is separate from empirical accuracy."])
serialized = json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
if argparse.ArgumentParser().parse_known_args()[1] == ["--write"]:
    output.write_text(serialized)
elif output.read_text() != serialized:
    raise ValueError("Published reference stale: build-solar-reference.py --write")
print("Published solar reference:", len(rows), "rides, median", data["summary"]["medianWhKm"], "Wh/km")
