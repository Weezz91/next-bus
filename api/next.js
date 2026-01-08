export default async function handler(req, res) {
  try {
    const KEY = process.env.DIGITRANSIT_KEY;
    if (!KEY) {
      return res.status(500).json({ error: "Missing DIGITRANSIT_KEY in Vercel env vars" });
    }

    const ROUTING_URL = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";
    const GEOCODE_URL = "https://api.digitransit.fi/geocoding/v1/search";
    const WANTED_LINES = new Set(["114", "111", "164", "164K", "164k"]);

    const address = String(req.query.address || "Matinpuronkuja 1");
    const radius = Number(req.query.radius || 700);
    const departuresPerStop = Number(req.query.n || 25);

    function depEpochSeconds(st) {
      const secondsSinceMidnight = (st.realtimeDeparture ?? st.scheduledDeparture ?? 0);
      return (st.serviceDay ?? 0) + secondsSinceMidnight;
    }

    async function digitransitGraphQL(query, variables) {
      const r = await fetch(ROUTING_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "digitransit-subscription-key": KEY
        },
        body: JSON.stringify({ query, variables })
      });
      if (!r.ok) throw new Error(`GraphQL ${r.status}: ${await r.text()}`);
      return r.json();
    }

    async function geocodeOne(text) {
      const url = new URL(GEOCODE_URL);
      url.searchParams.set("text", text);
      url.searchParams.set("size", "1");
      url.searchParams.set("lang", "fi");

      const r = await fetch(url, { headers: { "digitransit-subscription-key": KEY } });
      if (!r.ok) throw new Error(`Geocode ${r.status}: ${await r.text()}`);

      const json = await r.json();
      const feat = json?.features?.[0];
      if (!feat) return null;

      const [lon, lat] = feat.geometry.coordinates;
      return { lat, lon, label: feat.properties?.label ?? text };
    }

    async function mapLimit(items, limit, fn) {
      const out = new Array(items.length);
      let i = 0;
      const workers = Array.from({ length: limit }, async () => {
        while (i < items.length) {
          const idx = i++;
          out[idx] = await fn(items[idx], idx);
        }
      });
      await Promise.all(workers);
      return out;
    }

    const geo = await geocodeOne(address);
    if (!geo) return res.status(404).json({ error: "Address not found" });

    const stopsQuery = `
      query StopsByRadius($lat: Float!, $lon: Float!, $radius: Int!) {
        stopsByRadius(lat: $lat, lon: $lon, radius: $radius) {
          edges {
            node {
              distance
              stop { gtfsId name }
            }
          }
        }
      }
    `;

    const stopsResp = await digitransitGraphQL(stopsQuery, { lat: geo.lat, lon: geo.lon, radius });

    const edges = stopsResp?.data?.stopsByRadius?.edges ?? [];
    const stops = edges
      .map(e => ({
        distance: e.node.distance,
        gtfsId: e.node.stop.gtfsId,
        name: e.node.stop.name
      }))
      .filter(s => s.gtfsId && s.name)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);

    const stopDeparturesQuery = `
      query StopDeps($id: String!, $n: Int!) {
        stop(id: $id) {
          stoptimesWithoutPatterns(numberOfDepartures: $n) {
            serviceDay
            scheduledDeparture
            realtimeDeparture
            realtime
            headsign
            trip { route { shortName } }
          }
        }
      }
    `;

    const stopResults = await mapLimit(stops, 4, async (s) => {
      const r = await digitransitGraphQL(stopDeparturesQuery, { id: s.gtfsId, n: departuresPerStop });
      const times = r?.data?.stop?.stoptimesWithoutPatterns ?? [];

      const filtered = times
        .map(st => ({
          line: st?.trip?.route?.shortName ?? "",
          headsign: st?.headsign ?? "",
          realtime: !!st?.realtime,
          epoch: depEpochSeconds(st)
        }))
        .filter(x => WANTED_LINES.has(x.line))
        .filter(x => x.epoch > Math.floor(Date.now() / 1000) - 60)
        .sort((a, b) => a.epoch - b.epoch)
        .slice(0, 4);

      return { ...s, departures: filtered };
    });

    const flattened = [];
    for (const s of stopResults) {
      for (const d of s.departures) {
        flattened.push({
          stopName: s.name,
          distanceM: Math.round(s.distance),
          line: d.line,
          headsign: d.headsign,
          realtime: d.realtime,
          time: new Date(d.epoch * 1000).toISOString()
        });
      }
    }
    flattened.sort((a, b) => a.time.localeCompare(b.time));

    return res.status(200).json({
      addressUsed: geo.label,
      radius,
      results: flattened.slice(0, 12)
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
