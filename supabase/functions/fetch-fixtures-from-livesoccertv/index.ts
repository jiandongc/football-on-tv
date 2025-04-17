import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import axios from "https://esm.sh/axios@1.6.7";
import cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

const SUPABASE_URL = 'https://ctzvofxkshionnhggujl.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0enZvZnhrc2hpb25uaGdndWpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMjg5NTkyOCwiZXhwIjoyMDQ4NDcxOTI4fQ.lU7DFI-SdRr_L1UvQUB8p6LJ3uNjmhgOAlLzqT2EMF8';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch }
});

serve(async (req) => {
  try {

    const timestampGMT = new Date().toISOString();

    // Fetch the webpageß
    const response = await axios.get("https://www.livesoccertv.com/teams/england/manchester-united");
    const html = response.data;

    // Load HTML into cheerio for parsing
    const $ = cheerio.load(html);
    const table = $('.schedules');

    // Array to store fixture data
    let fixtures = [];
    let fixture = {};
  
    // Target the match schedule table (adjust selector based on actual page structure)
    table.find('tr').each((_, element) => {
      const row = $(element);

      if (row.hasClass("drow")) {
        const link = row.find("a").first(); // Get the first <a> in the drow
        const href = link.attr("href"); // "/schedules/2025-03-09/"
        const gameDate = href.match(/\/schedules\/(\d{4}-\d{2}-\d{2})\//)?.[1]; // "2025-03-09"
        console.log(gameDate);

        const competition = row.find("a").eq(1).text().trim();
        console.log(competition);

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

        console.log(score);
        console.log(homeTeam);
        console.log(awayTeam);

        fixture.name = matchInfo;
        fixture.home_team = homeTeam;
        fixture.away_team = awayTeam;
        fixture.game_time = gameTime;
        fixture.url = 'https://www.livesoccertv.com' + matchUrl;
        fixture.id = id;
        fixture.status = score;
        fixture.time_zone = "GMT";
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
        console.error("Error inserting fixtures:", error);
        return { success: false, error: error.message };
      }

      return { success: true, count: fixtures.length };
    } else {
      return { success: false, message: "No fixtures found" };
    }

  } catch (error) {
    console.error("Crawling error:", error);
    return { success: false, error: error.message };
  }
});