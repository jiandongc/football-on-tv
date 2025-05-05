import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";
import { DateTime } from 'https://esm.sh/luxon';

const SUPABASE_URL = 'https://ctzvofxkshionnhggujl.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0enZvZnhrc2hpb25uaGdndWpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMjg5NTkyOCwiZXhwIjoyMDQ4NDcxOTI4fQ.lU7DFI-SdRr_L1UvQUB8p6LJ3uNjmhgOAlLzqT2EMF8';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch }
});

// Utility function
function convertTimeZone(
  date: string,
  time: string,
  fromTimeZone: string,
  toTimeZone: string
): [string, string] {
  const sourceDateTime = DateTime.fromISO(`${date}T${time}`, { zone: fromTimeZone });
  const targetDateTime = sourceDateTime.setZone(toTimeZone);
  return [
    targetDateTime.toFormat('yyyy-MM-dd'),
    targetDateTime.toFormat('HH:mm:ss')
  ];
}

serve(async (req) => {
  try {
     const {data: fixtures, error: fixturesFetchError } = await supabase
          .from("fixtures")
          .select("*")
          .is("status", null);

     if (fixturesFetchError) {
         return new Response(JSON.stringify({ error: "Failed to fetch upcoming fixtures", details: fixturesFetchError.message }), { status: 500 });
     }

     if (!fixtures || fixtures.length === 0) {
         return new Response(JSON.stringify({ error: "No upcoming fixtures found" }), { status: 404 });
     }

     const {data: channels, error: channelsFetchError } = await supabase
          .from("channels")
          .select("*");

     if (channelsFetchError) {
         return new Response(JSON.stringify({ error: "Failed to fetch channels", details: channelsFetchError.message }), { status: 500 });
     }

     if (!channels || channels.length === 0) {
         return new Response(JSON.stringify({ error: "No channels found" }), { status: 404 });
     }

     const results = [];

     for (const fixture of fixtures) {
         const fixtureName = fixture.name;
         const fixtureUrl = fixture.url;
         console.log(fixtureUrl);
         const response = await fetch(fixtureUrl);
         const html = await response.text();

         // Load HTML into cheerio for parsing
         const $ = cheerio.load(html);
         const table = $('.ichannels');

         // Array to store listings data
         let listings = [];

        channelLoop:
        for (const channel of channels) {
          const channelName = channel.name;
          const channelCountry = channel.country;

          const rows = table.find('tr').toArray();
          for (const rowElement of rows) {
            const row = $(rowElement);
            const tds = row.find('td');

            if (tds.length < 2) continue;

            const countryTd = tds.eq(0).find('span.flag').text().trim();
            if (!countryTd) continue;

            const broadcasterTd = tds.eq(1);
            const linkElements = broadcasterTd.find('a').toArray();

            for (const linkElement of linkElements) {
              const channelTd = $(linkElement).text().trim();
              if (!channelTd) continue;

              const isMatch =
                countryTd.toLowerCase() === channelCountry.toLowerCase() &&
                channelTd.toLowerCase().includes(channelName.toLowerCase());

              if (isMatch) {
                const [channel_airing_date, channel_airing_time] = convertTimeZone(
                  fixture.game_date,
                  fixture.game_time,
                  fixture.time_zone,
                  channel.time_zone
                );

                listings.push({
                  fixture_id: fixture.id,
                  channel_id: channel.id,
                  updated: new Date().toISOString(),
                  airing_date: channel_airing_date,
                  airing_time: channel_airing_time,
                });

                continue channelLoop;
              }
            }
          }
        }

         // Insert listings into Supabase
         if (listings.length > 0) {
             for (const listing of listings) {
                console.log(listing);
             }

             const { data, error } = await supabase
                .from("fixture_channel_listings")
                .upsert(listings, { onConflict: ["fixture_id", "channel_id"] });

             if (error) {
                 console.error(`Upsert failed for fixture: ${fixture.name} - ${error.message}`);
                 results.push({fixtureName, status: "error", error: error.message });
             } else {
                 results.push({fixtureName, status: "success", message: `Listings upserted successfully for fixture ${fixture.name}`, data });
             }
         } else {
             results.push({fixtureName, status: "failed", message: `No listings found for fixture ${fixture.name}`});
         }
     }
     console.log(results);
     return new Response(JSON.stringify({ message: "Processing complete", results }), { status: 200 });

  } catch (error) {
    console.error("Crawling error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});