import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch }
});

const getFormattedDate = (date) => date.toISOString().split("T")[0];

serve(async (req) => {
  try {

    const { data: teamIds, error: fetchError } = await supabase
      .from("teams")
      .select("sportmonks_id");

    if (fetchError) {
      return new Response(JSON.stringify({ error: "Failed to fetch sportmonks_ids", details: fetchError.message }), { status: 500 });
    }

    if (!teamIds || teamIds.length === 0) {
      return new Response(JSON.stringify({ error: "No Team IDs found" }), { status: 404 });
    }

    const today = new Date();
    const startDate = getFormattedDate(new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000));
    const endDate = getFormattedDate(new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000));
    const timestampGMT = new Date().toISOString();

    const results = [];
    for (const item of teamIds) {
      const teamId = item.sportmonks_id;
      console.log(`Fetching data for team ID: ${teamId}`);
      const API_ENDPOINT = `https://api.sportmonks.com/v3/football/fixtures/between/${startDate}/${endDate}/${teamId}?api_token=zGaYOFqQFCVz8MoRigrsdgNbc9NjcX1ls6Zd3WjONckxDRhHzwOdPY0bTK0M`;
      console.log(`${API_ENDPOINT}`);


      const response = await fetch(API_ENDPOINT);
      if (!response.ok) {
        console.error(`Failed to fetch fixtures for team ID: ${teamId}`);
        results.push({ teamId, status: "error", error: `Failed to fetch fixtures for team ID: ${teamId}` });
        continue; 
      }

      const { data: fixtures } = await response.json();
      if (!fixtures || fixtures.length === 0) {
        results.push({ teamId, status: "success", message: `No fixtures found team ID: ${teamId}` });
        continue;
      }

      const upsertData = fixtures.map(fixture => {
        const teams = fixture.name.split(" vs ");
        return {
          name: fixture.name,
          home_team: teams[0],
          away_team: teams[1],
          game_time: fixture.starting_at,
          time_zone: "GMT",
          id: fixture.id,
          status: fixture.result_info,
          updated: timestampGMT
        };
      });

      const { data, error } = await supabase
        .from("fixtures")
        .upsert(upsertData, { onConflict: ["name"] }); 

      if (error) {
        console.error(`Upsert failed for team ID: ${teamId} - ${error.message}`);
        results.push({ teamId, status: "error", error: error.message });
      } else {
        results.push({ teamId, status: "success", message: `Fixtures upserted successfully for team ID ${teamId}`, data });
      }
    }

    return new Response(JSON.stringify({ message: "Processing complete", results }), { status: 200 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});