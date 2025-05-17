import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = 'https://ctzvofxkshionnhggujl.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0enZvZnhrc2hpb25uaGdndWpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMjg5NTkyOCwiZXhwIjoyMDQ4NDcxOTI4fQ.lU7DFI-SdRr_L1UvQUB8p6LJ3uNjmhgOAlLzqT2EMF8';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch }
});

const TEAM_NAME = 'Arsenal';

// Function to convert country names to flag emojis
function getFlagEmoji(country) {
    const countryFlags = {
        "Great Britain": "🇬🇧",
        "USA": "🇺🇸",
        "France": "🇫🇷",
        "Germany": "🇩🇪",
        "Spain": "🇪🇸",
        "Italy": "🇮🇹",
        "Canada": "🇨🇦",
        "Australia": "🇦🇺"
        // Add more countries as needed
    };

    return countryFlags[country] || "🏳️"; // Default flag if country is not found
}

// Function to convert time format
function formatTime(timeString) {
    const [hour, minute] = timeString.split(':'); // Extract hours and minutes
    const hourInt = parseInt(hour, 10);
    const period = hourInt >= 12 ? 'PM' : 'AM'; // Determine AM or PM
    const formattedHour = hourInt % 12 || 12; // Convert 24-hour to 12-hour format

    return `${formattedHour}:${minute} ${period}`;
}



function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\!/g, "%21")
    .replace(/\'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

async function createOAuth1Header(method: string, url: string, params: Record<string, string>) {
  const oauth = {
    oauth_consumer_key: '7MW86o0DalCmZ0J9b6f27GZay',
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: '1919192379036495872-EW9ftCPsWz8PHa9h9FaToWjyECQeoY',
    oauth_version: "1.0",
  };

  const allParams = { ...params, ...oauth };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys.map(k => `${percentEncode(k)}=${percentEncode(allParams[k])}`).join("&");

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  const signingKey = `${percentEncode('UnmiIR1yaGoEt0RDkjXx3b4ISXQP8DgJ8EBPxIpcgeW3NHFOM5')}&${percentEncode('BJCnlRGRM73NOpzPnjY4zJ0cPEcUxSmyxIQjpc09vLImc')}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingKey), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(baseString));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  return (
    "OAuth " +
    Object.entries({ ...oauth, oauth_signature: signature })
      .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
      .join(", ")
  );
}

serve(async (req) => {

    const { data: fixtureListings, error: fetchError  } = await supabase
      .from('fixture_channel_listings_view')
      .select('*')
      .or(`home_team.eq.${TEAM_NAME},away_team.eq.${TEAM_NAME}`)
      .is('match_status', null)
      .not('channel_airing_date', 'is', null)
      .not('channel_airing_time', 'is', null);

    if (fetchError) {
        console.error("Failed to fetch fixture_channel_listings_view.", fetchError.message);
        return new Response(JSON.stringify({ error: "Failed to fetch fixture_channel_listings_view", details: fetchError.message }), { status: 500 });
    }

    if (!fixtureListings || fixtureListings.length === 0) {
        console.error("No fixtures found.", fetchError.message);
        return new Response(JSON.stringify({ error: "No fixtures found" }), { status: 404 });
    }

    const url = "https://api.twitter.com/2/tweets";
    const authHeader = await createOAuth1Header("POST", url, {});
    console.log(authHeader);

    const groupedFixtureListings = fixtureListings.reduce((acc, fixtureListing) => {
      const key = `${fixtureListing.fixture_id}-${fixtureListing.channel_country}`; // Composite key
      acc[key] = acc[key] || [];
      acc[key].push(fixtureListing);
      return acc;
    }, {});

    for (const [key, items] of Object.entries(groupedFixtureListings)) {
        console.log(`Key: ${key}`);
        console.log('Items:', items);

        const fixtureListing = items[0];

        const today = new Date();
        const matchDate = new Date(fixtureListing.channel_airing_date);
        const daysUntilMatch = Math.ceil((matchDate - today) / (1000 * 60 * 60 * 24));
        const flagEmoji = getFlagEmoji(fixtureListing.channel_country);
        const formattedTime = formatTime(fixtureListing.channel_airing_time); // Convert time format

        if (daysUntilMatch > 5 || daysUntilMatch < 1) {
            console.log(`daysUntilMatch: ${daysUntilMatch}. Skip.`)
            continue;
        }

        const channels = items
           .map(item => `${item.channel_name} ${flagEmoji} (${item.channel_twitter_handle})`)
           .join('\n');

        const tweet = `🚨 Only ${daysUntilMatch} days to go! 🚨\n\n` +
                      `⚽ ${fixtureListing.home_team} vs ${fixtureListing.away_team}\n\n` +
                      `📅 ${fixtureListing.channel_airing_date}\n\n` +
                      `⏰ ${fixtureListing.channel_time_zone} ${formattedTime}\n\n` +
                      `📺 Watch it live on: \n\n${channels}`;

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: tweet }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error("Tweet failed:", errText);
        } else {
          console.log("Tweet posted");
        }
    }

    return new Response("Processing completed.", { status: 200 });

});
