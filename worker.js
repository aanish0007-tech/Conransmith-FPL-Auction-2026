const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Auction-Key",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/profiles") {
      if (request.method === "GET") {
        const value = await env.AUCTION_KV.get("profiles");
        return new Response(value || JSON.stringify({ profiles: {} }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (request.method === "POST") {
        const suppliedKey = request.headers.get("X-Auction-Key");

        if (!suppliedKey || suppliedKey !== env.AUCTION_KEY) {
          return new Response("Unauthorized", {
            status: 401,
            headers: corsHeaders
          });
        }

        const body = await request.text();

        if (!body || body.length > 500000) {
          return new Response("Invalid profiles payload", {
            status: 400,
            headers: corsHeaders
          });
        }

        try {
          const parsed = JSON.parse(body);

          if (!parsed || typeof parsed.profiles !== "object") {
            throw new Error();
          }
        } catch {
          return new Response("Profiles must be valid JSON", {
            status: 400,
            headers: corsHeaders
          });
        }

        await env.AUCTION_KV.put("profiles", body);

        return new Response(
          JSON.stringify({
            ok: true,
            updatedAt: Date.now()
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }

      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders
      });
    }

    if (url.pathname === "/auction-state") {
      if (request.method === "GET") {
        const value = await env.AUCTION_KV.get("state");

        return new Response(value || JSON.stringify({}), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      if (request.method === "POST") {
        const suppliedKey = request.headers.get("X-Auction-Key");

        if (!suppliedKey || suppliedKey !== env.AUCTION_KEY) {
          return new Response("Unauthorized", {
            status: 401,
            headers: corsHeaders
          });
        }

        const body = await request.text();

        if (!body || body.length > 500000) {
          return new Response("Invalid auction state", {
            status: 400,
            headers: corsHeaders
          });
        }

        let parsed;

        try {
          parsed = JSON.parse(body);

          if (
            !parsed ||
            !Array.isArray(parsed.players) ||
            !Array.isArray(parsed.participants)
          ) {
            throw new Error();
          }

          if (
            !Number.isInteger(Number(parsed.revision)) ||
            Number(parsed.revision) < 0
          ) {
            throw new Error();
          }
        } catch {
          return new Response(
            "Auction state must be valid JSON with a non-negative integer revision",
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        const currentBody = await env.AUCTION_KV.get("state");

        if (currentBody) {
          try {
            const current = JSON.parse(currentBody);

            const currentRevision = Number.isInteger(
              Number(current?.revision)
            )
              ? Number(current.revision)
              : -1;

            if (currentRevision > Number(parsed.revision)) {
              return new Response(
                JSON.stringify({
                  ok: false,
                  stale: true,
                  currentRevision,
                  incomingRevision: Number(parsed.revision)
                }),
                {
                  status: 409,
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json"
                  }
                }
              );
            }
          } catch {
            // Allow valid incoming state to replace malformed/legacy state.
          }
        }

        await env.AUCTION_KV.put("state", body);

        return new Response(
          JSON.stringify({
            ok: true,
            updatedAt: Date.now(),
            revision: Number(parsed.revision)
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }

      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders
      });
    }

    if (url.pathname.startsWith("/fpl-api/")) {
      const targetPath = url.pathname.replace("/fpl-api", "");

      const targetUrl =
        "https://fantasy.premierleague.com/api" +
        targetPath +
        url.search;

      try {
        const response = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0"
          }
        });

        return new Response(response.body, {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type":
              response.headers.get("Content-Type") ||
              "application/json"
          }
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "FPL API request failed",
            message: error.message
          }),
          {
            status: 502,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }
    }

    return new Response("Not found", {
      status: 404,
      headers: corsHeaders
    });
  }
};
