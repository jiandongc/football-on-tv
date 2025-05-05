import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

const SUPABASE_URL = 'https://ctzvofxkshionnhggujl.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0enZvZnhrc2hpb25uaGdndWpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMjg5NTkyOCwiZXhwIjoyMDQ4NDcxOTI4fQ.lU7DFI-SdRr_L1UvQUB8p6LJ3uNjmhgOAlLzqT2EMF8';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch }
});


serve(async (req) => {
  try {
     const { data: livesoccertvUrls, error: fetchError } = await supabase
          .from("teams")
          .select("livesoccertv_url");

     if (fetchError) {
         return new Response(JSON.stringify({ error: "Failed to fetch livesoccertv_url", details: fetchError.message }), { status: 500 });
     }

     if (!livesoccertvUrls || livesoccertvUrls.length === 0) {
         return new Response(JSON.stringify({ error: "No Livesoccertv Urls found" }), { status: 404 });
     }

     const timestampGMT = new Date().toISOString();
     const results = [];

     for (const data of livesoccertvUrls) {
         const teamUrl = data.livesoccertv_url;
         console.log(teamUrl);
         const response = await fetch(teamUrl);
         const html = await response.text();

         // Load HTML into cheerio for parsing
         const $ = cheerio.load(html);
         const table = $('.schedules');

         // Array to store fixture data
         let fixtures = [];
         let fixture = {};

         table.find('tr').each((_, element) => {
             const row = $(element);

             if (row.hasClass("drow")) {
                const link = row.find("a").first();
                const href = link.attr("href");
                const gameDate = href.match(/\/schedules\/(\d{4}-\d{2}-\d{2})\//)?.[1];
                const competition = row.find("a").eq(1).text().trim();
                fixture.game_date = gameDate;
                fixture.competition = competition;
             }

             if (row.hasClass("matchrow")) {
                const id = row.attr("id");
                const gameTime = row.find(".timecell span").first().text().trim();

                const matchLink = row.find("td#match a"); // Select the <a>
                const matchInfo = matchLink.text().trim(); // "Nottingham Forest 1 - 0 Manchester United"
                const scoreMatch = matchInfo.match(/(.*?)\s(\d+\s-\s\d+)\s(.*)/);
                const matchUrl = matchLink.attr("href");

                let homeTeam = null;
                let awayTeam = null;
                let score = null;

                if (scoreMatch) {
                  homeTeam = scoreMatch[1].trim();
                  score = scoreMatch[2].trim();
                  awayTeam = scoreMatch[3].trim();
                } else {
                  [homeTeam, awayTeam] = matchInfo.split(" vs ").map((team) => team.trim());
                }

                fixture.name = matchInfo;
                fixture.home_team = homeTeam;
                fixture.away_team = awayTeam;
                fixture.game_time = gameTime === "" ? null : gameTime;
                fixture.url = 'https://www.livesoccertv.com' + matchUrl;
                fixture.id = id;
                fixture.status = score;
                fixture.time_zone = "America/New_York";
                fixture.updated = timestampGMT;

                fixtures.push(fixture);
                fixture = {};
             }
         });

         // Insert fixtures into Supabase
         if (fixtures.length > 0) {
             for (const fixture of fixtures) {
                console.log(fixture);
             }

             const { data, error } = await supabase
                .from("fixtures")
                .upsert(fixtures, { onConflict: ["id"] });

             if (error) {
                 console.error(`Upsert failed for team ID: ${teamUrl} - ${error.message}`);
                 results.push({teamUrl, status: "error", error: error.message });
             } else {
                 results.push({teamUrl, status: "success", message: `Fixtures upserted successfully for teamUrl ${teamUrl}`, data });
             }
         } else {
             results.push({teamUrl, status: "failed", message: `No fixtures found for teamUrl ${teamUrl}`});
         }
     }
     console.log(results);
     return new Response(JSON.stringify({ message: "Processing complete", results }), { status: 200 });

  } catch (error) {
    console.error("Crawling error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});