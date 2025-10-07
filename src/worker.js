export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/api/ping") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    // Distance Matrix proxy: /api/dm?origins=lat,lng|lat,lng&destinations=lat,lng|...&mode=driving
    if (url.pathname === "/api/dm") {
      const origins = url.searchParams.get("origins");
      const destinations = url.searchParams.get("destinations");
      const mode = url.searchParams.get("mode") || "driving";
      const departure_time = url.searchParams.get("departure_time");
      const traffic_model = url.searchParams.get("traffic_model");

      if (!origins || !destinations) {
        return new Response(JSON.stringify({ error: "missing origins/destinations" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const apiKey = env.DISTANCEMATRIX_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "server missing API key" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      const base = "https://api.distancematrix.ai/maps/api/distancematrix/json";
      const params = new URLSearchParams({ origins, destinations, key: apiKey, mode });
      if (departure_time) params.set("departure_time", departure_time);
      if (traffic_model) params.set("traffic_model", traffic_model);
      const upstream = `${base}?${params.toString()}`;

      const res = await fetch(upstream, { method: "GET" });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") || "application/json" },
      });
    }

    // Fallback to static assets from the project root
    return env.ASSETS.fetch(request);
  },
};