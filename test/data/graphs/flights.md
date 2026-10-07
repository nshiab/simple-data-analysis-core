# Fictional scheduled flights

`flights.csv` is an original, synthetic teaching dataset distributed under this
repository's MIT license. Its 33 flights connect 12 cities, including Montreal,
over January 15–17, 2030. It is not sourced from an airline or a booking
service. Schedules, flight IDs, and prices are invented and must not be used for
travel planning. Cities represent graph nodes, not specific airports.

## Schema and assumptions

| Column        | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| `flightId`    | Unique fictional flight identifier.                    |
| `origin`      | Departure city; directed edge source.                  |
| `destination` | Arrival city; directed edge target.                    |
| `departure`   | Departure timestamp in UTC.                            |
| `arrival`     | Arrival timestamp in UTC.                              |
| `price`       | Invented one-way fare in Canadian dollars, per flight. |

Every timestamp is UTC, including flights crossing time zones or the date line.
The CSV uses `YYYY-MM-DD HH:mm:ss`; DuckDB infers `TIMESTAMP` for both time
columns without a conversion. `TIMESTAMP` itself has no timezone: interpreting
all values as UTC is an explicit dataset convention. Prices are additive and
exclude baggage, taxes, discounts, and other booking considerations.

Chronological examples require at least 60 minutes between arrival and the next
departure (`minGapMs: 60 * 60 * 1000`). Elapsed time runs from the first
flight's departure through the last flight's arrival, including layovers. There
is no fixed initial departure deadline or waiting time before the first flight.

## Expected results

From Montreal, minimizing price produces these destinations. Each elapsed time
belongs to that destination's cheapest valid itinerary.

| Destination | Total CAD | Elapsed hours |
| ----------- | --------: | ------------: |
| Toronto     |        80 |           1.5 |
| New York    |       120 |           1.5 |
| Vancouver   |       180 |           5.5 |
| Mexico City |       290 |             9 |
| London      |       350 |            10 |
| Paris       |       430 |         12.25 |
| Frankfurt   |       460 |            13 |
| Dubai       |       590 |            19 |
| Tokyo       |       700 |            17 |
| Singapore   |       770 |          28.5 |
| Sydney      |      1020 |            38 |

The cheapest Tokyo itinerary is F003 then F014 via Vancouver: CAD 700 and 17
hours, including a 90-minute connection. The fastest is F006 then F033 via
Toronto: CAD 1,050 and 16 hours, including a 60-minute connection. The later
Montreal departure makes this itinerary faster in elapsed time, although it
arrives an hour later than the Vancouver itinerary.

F001 followed by F007 would cost only CAD 280, but provides just 30 minutes in
Toronto. It is excluded by the minimum connection time. The tests also check
that removing this constraint makes that itinerary the cheapest.

## Independent reference calculation

`test/unit/examples/flightRoutes.test.ts` checks these results against the
public API, including the inferred timestamp types and both Tokyo itineraries.
The expected values were calculated independently with this standard-library
Python route enumeration, not with the graph implementation:

```python
import csv
from datetime import datetime, timezone

with open("test/data/graphs/flights.csv", newline="") as source:
    flights = list(csv.DictReader(source))
for flight in flights:
    for field in ("departure", "arrival"):
        flight[field] = datetime.fromisoformat(flight[field]).replace(
            tzinfo=timezone.utc
        ).timestamp()
    flight["price"] = int(flight["price"])

routes = []
def walk(city, path):
    for flight in flights:
        if flight["origin"] != city:
            continue
        if path and flight["departure"] < path[-1]["arrival"] + 3600:
            continue
        route = path + [flight]
        routes.append({
            "destination": flight["destination"],
            "price": sum(step["price"] for step in route),
            "hours": (flight["arrival"] - route[0]["departure"]) / 3600,
            "flightIds": [step["flightId"] for step in route],
        })
        walk(flight["destination"], route)

walk("Montreal", [])
cheapest = {}
for route in sorted(routes, key=lambda r: (r["price"], r["hours"])):
    cheapest.setdefault(route["destination"], route)
print(list(cheapest.values()))
print(min(
    (route for route in routes if route["destination"] == "Tokyo"),
    key=lambda r: (r["hours"], r["price"]),
))
```

Every flight has positive duration, so chronological recursion terminates even
where the city graph contains cycles.
