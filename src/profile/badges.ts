export type Tier = "bronze" | "silver" | "gold" | "violet";

export type Facts = {
  hours: number;
  launches: number;
  builds: number;
  worlds: number;
  friends: number;
  likes: number;
  verified: boolean;
  linked: boolean;
  days: number;
  created: number;
  clan: boolean;
  profile: number;
  dev: boolean;
};

type Metric = "hours" | "launches" | "builds" | "worlds" | "friends" | "likes" | "days" | "profile";

export type Badge = {
  id: string;
  emblem: string;
  tier: Tier;
  series?: string;
  metric?: Metric;
  goal?: number;
  check?: (f: Facts) => boolean;
};

export const BADGES: Badge[] = [
  { id: "early", emblem: "sprout", tier: "violet", check: (f) => f.created > 0 && f.created < Date.UTC(2027, 0, 1) },
  { id: "firstLaunch", emblem: "play", tier: "bronze", series: "launches", metric: "launches", goal: 1 },
  { id: "launches100", emblem: "rocket", tier: "silver", series: "launches", metric: "launches", goal: 100 },
  { id: "launches1000", emblem: "rocket", tier: "gold", series: "launches", metric: "launches", goal: 1000 },
  { id: "hours10", emblem: "hourglass", tier: "bronze", series: "hours", metric: "hours", goal: 10 },
  { id: "hours100", emblem: "hourglass", tier: "silver", series: "hours", metric: "hours", goal: 100 },
  { id: "hours500", emblem: "hourglass", tier: "gold", series: "hours", metric: "hours", goal: 500 },
  { id: "builds5", emblem: "crates", tier: "bronze", metric: "builds", goal: 5 },
  { id: "worlds10", emblem: "globe", tier: "silver", series: "worlds", metric: "worlds", goal: 10 },
  { id: "worlds50", emblem: "globe", tier: "gold", series: "worlds", metric: "worlds", goal: 50 },
  { id: "friends1", emblem: "duo", tier: "bronze", series: "friends", metric: "friends", goal: 1 },
  { id: "friends10", emblem: "group", tier: "silver", series: "friends", metric: "friends", goal: 10 },
  { id: "friends25", emblem: "group", tier: "gold", series: "friends", metric: "friends", goal: 25 },
  { id: "likes10", emblem: "heart", tier: "silver", series: "likes", metric: "likes", goal: 10 },
  { id: "likes100", emblem: "heart", tier: "gold", series: "likes", metric: "likes", goal: 100 },
  { id: "verified", emblem: "verified", tier: "violet", check: (f) => f.verified },
  { id: "linked", emblem: "link", tier: "violet", check: (f) => f.linked },
  { id: "clan", emblem: "shield", tier: "violet", check: (f) => f.clan },
  { id: "profile", emblem: "crown", tier: "silver", metric: "profile", goal: 5 },
  { id: "veteran", emblem: "medal", tier: "gold", metric: "days", goal: 365 },
];

export const earned = (b: Badge, f: Facts) => f.dev || (b.check ? b.check(f) : f[b.metric!] >= b.goal!);

export const progress = (b: Badge, f: Facts) => (earned(b, f) ? 1 : b.check ? 0 : Math.min(1, f[b.metric!] / b.goal!));

export const seriesOf = (b: Badge) => (b.series ? BADGES.filter((x) => x.series === b.series) : [b]);
