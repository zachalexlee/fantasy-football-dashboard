// Where to legally watch each NFL game. Options are keyed off the broadcast
// network the NFL slate reports for that game, plus always-available league-wide
// options (NFL+, antenna, etc.). Only licensed sources — official broadcasters,
// their streaming apps, free-with-antenna and free-trial paths.

export type WatchOption = {
  name: string;
  url: string;
  note: string;
  free: boolean;
};

// Normalize the many network label variants ESPN returns into a provider key.
export function networkKey(network: string | null | undefined): string {
  const n = (network ?? "").toUpperCase();
  if (n.includes("CBS")) return "CBS";
  if (n.includes("FOX")) return "FOX";
  if (n.includes("NBC")) return "NBC";
  if (n.includes("ABC")) return "ABC";
  if (n.includes("ESPN")) return "ESPN";
  if (n.includes("PRIME") || n.includes("AMAZON")) return "PRIME";
  if (n.includes("NETFLIX")) return "NETFLIX";
  if (n.includes("NFL")) return "NFLNET";
  if (n.includes("PEACOCK")) return "PEACOCK";
  return "OTHER";
}

export function networkLabel(key: string): string {
  return (
    {
      CBS: "CBS",
      FOX: "FOX",
      NBC: "NBC (Sunday Night Football)",
      ABC: "ABC",
      ESPN: "ESPN (Monday Night Football)",
      PRIME: "Prime Video (Thursday Night Football)",
      NETFLIX: "Netflix",
      NFLNET: "NFL Network",
      PEACOCK: "Peacock",
      OTHER: "TBD",
    }[key] ?? "TBD"
  );
}

const BROADCAST_APP: Record<string, WatchOption[]> = {
  CBS: [
    { name: "Antenna (local CBS)", url: "https://www.fcc.gov/media/engineering/dtvmaps", free: true, note: "Free over-the-air in your market with any TV antenna" },
    { name: "Paramount+", url: "https://www.paramountplus.com/live-tv/", free: false, note: "Streams your local CBS game live (Premium plan); free trial available" },
    { name: "CBS Sports app", url: "https://www.cbssports.com/watch/", free: true, note: "Free scores + highlights; live game needs a Paramount+/TV login" },
  ],
  FOX: [
    { name: "Antenna (local FOX)", url: "https://www.fcc.gov/media/engineering/dtvmaps", free: true, note: "Free over-the-air in your market with any TV antenna" },
    { name: "Tubi", url: "https://tubitv.com/", free: true, note: "FOX's free service streams many Sunday FOX games at no cost, no login" },
    { name: "Fox Sports app", url: "https://www.foxsports.com/live", free: false, note: "Live FOX game with a TV-provider login" },
  ],
  NBC: [
    { name: "Antenna (local NBC)", url: "https://www.fcc.gov/media/engineering/dtvmaps", free: true, note: "Free over-the-air with any TV antenna" },
    { name: "Peacock", url: "https://www.peacocktv.com/sports/nfl", free: false, note: "Streams Sunday Night Football (Premium plan)" },
  ],
  ABC: [
    { name: "Antenna (local ABC)", url: "https://www.fcc.gov/media/engineering/dtvmaps", free: true, note: "Free over-the-air with any TV antenna" },
    { name: "ESPN app", url: "https://www.espn.com/watch/", free: false, note: "Simulcasts ABC games with a TV-provider or ESPN login" },
  ],
  ESPN: [
    { name: "ESPN app / ESPN.com", url: "https://www.espn.com/watch/", free: false, note: "Monday Night Football with a TV-provider or ESPN subscription" },
  ],
  PRIME: [
    { name: "Prime Video", url: "https://www.amazon.com/gp/video/nfl", free: false, note: "Exclusive home of Thursday Night Football (Prime membership)" },
  ],
  NETFLIX: [
    { name: "Netflix", url: "https://www.netflix.com/", free: false, note: "Streams Netflix's scheduled NFL games (any plan)" },
  ],
  NFLNET: [
    { name: "NFL+", url: "https://www.nfl.com/plus/", free: false, note: "NFL Network games stream on NFL+" },
    { name: "NFL Network app", url: "https://www.nfl.com/network/watch/", free: false, note: "Live with a TV-provider login" },
  ],
  PEACOCK: [
    { name: "Peacock", url: "https://www.peacocktv.com/sports/nfl", free: false, note: "Peacock-exclusive game (Premium plan)" },
  ],
  OTHER: [
    { name: "NFL.com schedule", url: "https://www.nfl.com/schedules/", free: true, note: "Check the official schedule for this game's broadcaster" },
  ],
};

// Always-available, league-wide legal ways to watch.
export const LEAGUE_WIDE: WatchOption[] = [
  { name: "NFL+", url: "https://www.nfl.com/plus/", free: false, note: "Live local & primetime games on phone/tablet; free trial available" },
  { name: "Antenna (free OTA)", url: "https://www.fcc.gov/media/engineering/dtvmaps", free: true, note: "CBS / FOX / NBC / ABC games are free over the air — check your local channels" },
  { name: "Tubi (free)", url: "https://tubitv.com/", free: true, note: "Streams many Sunday FOX games free, no subscription or login" },
  { name: "Streaming free trials", url: "https://www.youtube.com/tv", free: true, note: "YouTube TV, Fubo, DirecTV Stream, Sling and Paramount+ all offer free trials that cover game day" },
];

export function optionsForNetwork(network: string | null | undefined): WatchOption[] {
  return BROADCAST_APP[networkKey(network)] ?? BROADCAST_APP.OTHER;
}
