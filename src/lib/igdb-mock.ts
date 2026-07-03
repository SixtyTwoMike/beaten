// Built-in sample catalog used when IGDB_MOCK=1, so the app can be developed
// and demoed without Twitch/IGDB credentials. Platform ids match real IGDB
// platform ids; game ids are synthetic (900xxx) to avoid colliding with real
// IGDB data if the app is later switched to the live API.

import type { IgdbGame, IgdbPlatform } from "./igdb";

export const mockPlatforms: IgdbPlatform[] = [
  { id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC", generation: null, category: 4 },
  { id: 48, name: "PlayStation 4", abbreviation: "PS4", generation: 8, category: 1 },
  { id: 167, name: "PlayStation 5", abbreviation: "PS5", generation: 9, category: 1 },
  { id: 130, name: "Nintendo Switch", abbreviation: "Switch", generation: 8, category: 1 },
  { id: 49, name: "Xbox One", abbreviation: "XONE", generation: 8, category: 1 },
  { id: 169, name: "Xbox Series X|S", abbreviation: "Series X|S", generation: 9, category: 1 },
  { id: 19, name: "Super Nintendo Entertainment System", abbreviation: "SNES", generation: 4, category: 1 },
  { id: 18, name: "Nintendo Entertainment System", abbreviation: "NES", generation: 3, category: 1 },
  { id: 4, name: "Nintendo 64", abbreviation: "N64", generation: 5, category: 1 },
  { id: 21, name: "Nintendo GameCube", abbreviation: "NGC", generation: 6, category: 1 },
  { id: 5, name: "Wii", abbreviation: "Wii", generation: 7, category: 1 },
  { id: 41, name: "Wii U", abbreviation: "WiiU", generation: 8, category: 1 },
  { id: 7, name: "PlayStation", abbreviation: "PS1", generation: 5, category: 1 },
  { id: 8, name: "PlayStation 2", abbreviation: "PS2", generation: 6, category: 1 },
  { id: 9, name: "PlayStation 3", abbreviation: "PS3", generation: 7, category: 1 },
  { id: 12, name: "Xbox 360", abbreviation: "X360", generation: 7, category: 1 },
  { id: 24, name: "Game Boy Advance", abbreviation: "GBA", generation: 6, category: 5 },
  { id: 20, name: "Nintendo DS", abbreviation: "NDS", generation: 7, category: 5 },
  { id: 37, name: "Nintendo 3DS", abbreviation: "3DS", generation: 8, category: 5 },
  { id: 23, name: "Dreamcast", abbreviation: "DC", generation: 6, category: 1 },
  { id: 29, name: "Sega Mega Drive/Genesis", abbreviation: "Genesis", generation: 4, category: 1 },
];

export const mockGames: IgdbGame[] = [
  {
    igdbId: 900001,
    name: "The Legend of Zelda: Breath of the Wild",
    slug: "the-legend-of-zelda-breath-of-the-wild",
    coverUrl: null,
    releaseYear: 2017,
    summary:
      "Step into a world of discovery, exploration, and adventure in this open-air take on Hyrule.",
    platformIds: [130, 41],
  },
  {
    igdbId: 900002,
    name: "Elden Ring",
    slug: "elden-ring",
    coverUrl: null,
    releaseYear: 2022,
    summary:
      "A vast fantasy action RPG from FromSoftware. Rise, Tarnished, and claim the Elden Ring.",
    platformIds: [6, 48, 167, 49, 169],
  },
  {
    igdbId: 900003,
    name: "Hades",
    slug: "hades",
    coverUrl: null,
    releaseYear: 2020,
    summary:
      "Defy the god of the dead in this rogue-like dungeon crawler from Supergiant Games.",
    platformIds: [6, 130, 48, 167, 49, 169],
  },
  {
    igdbId: 900004,
    name: "Hollow Knight",
    slug: "hollow-knight",
    coverUrl: null,
    releaseYear: 2017,
    summary:
      "Forge your own path through a vast, ruined kingdom of insects and heroes.",
    platformIds: [6, 130, 48, 49],
  },
  {
    igdbId: 900005,
    name: "Chrono Trigger",
    slug: "chrono-trigger",
    coverUrl: null,
    releaseYear: 1995,
    summary:
      "A legendary time-travelling JRPG following Crono and friends across eras to save the planet.",
    platformIds: [19, 7, 20, 6],
  },
  {
    igdbId: 900006,
    name: "Super Metroid",
    slug: "super-metroid",
    coverUrl: null,
    releaseYear: 1994,
    summary:
      "Samus Aran returns to planet Zebes in the genre-defining exploration classic.",
    platformIds: [19],
  },
  {
    igdbId: 900007,
    name: "Half-Life 2",
    slug: "half-life-2",
    coverUrl: null,
    releaseYear: 2004,
    summary:
      "Gordon Freeman fights the Combine occupation in City 17 with the iconic gravity gun.",
    platformIds: [6, 11, 12],
  },
  {
    igdbId: 900008,
    name: "Portal 2",
    slug: "portal-2",
    coverUrl: null,
    releaseYear: 2011,
    summary:
      "Think with portals in Aperture Science's award-winning first-person puzzler.",
    platformIds: [6, 9, 12],
  },
  {
    igdbId: 900009,
    name: "Dark Souls",
    slug: "dark-souls",
    coverUrl: null,
    releaseYear: 2011,
    summary:
      "Prepare to die in Lordran, the punishing action RPG that spawned a genre.",
    platformIds: [9, 12, 6],
  },
  {
    igdbId: 900010,
    name: "God of War",
    slug: "god-of-war-2018",
    coverUrl: null,
    releaseYear: 2018,
    summary:
      "Kratos and Atreus journey through the Norse wilds in this reinvention of the series.",
    platformIds: [48, 6],
  },
  {
    igdbId: 900011,
    name: "Celeste",
    slug: "celeste",
    coverUrl: null,
    releaseYear: 2018,
    summary:
      "Help Madeline survive her climb of Celeste Mountain in this tight platformer.",
    platformIds: [6, 130, 48, 49],
  },
  {
    igdbId: 900012,
    name: "Stardew Valley",
    slug: "stardew-valley",
    coverUrl: null,
    releaseYear: 2016,
    summary:
      "Inherit your grandfather's old farm plot and build the life you've dreamed of.",
    platformIds: [6, 130, 48, 49, 20],
  },
  {
    igdbId: 900013,
    name: "Super Mario 64",
    slug: "super-mario-64",
    coverUrl: null,
    releaseYear: 1996,
    summary: "Mario's landmark leap into 3D across the paintings of Peach's castle.",
    platformIds: [4],
  },
  {
    igdbId: 900014,
    name: "Final Fantasy VII",
    slug: "final-fantasy-vii",
    coverUrl: null,
    releaseYear: 1997,
    summary:
      "Cloud Strife joins AVALANCHE against the Shinra corporation and Sephiroth.",
    platformIds: [7, 6],
  },
  {
    igdbId: 900015,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    coverUrl: null,
    releaseYear: 2015,
    summary:
      "Geralt of Rivia hunts the Wild Hunt across a war-torn open world.",
    platformIds: [6, 48, 49, 130, 167, 169],
  },
  {
    igdbId: 900016,
    name: "Metroid Prime",
    slug: "metroid-prime",
    coverUrl: null,
    releaseYear: 2002,
    summary:
      "Samus explores Tallon IV in first person in Retro Studios' acclaimed adventure.",
    platformIds: [21, 5],
  },
  {
    igdbId: 900017,
    name: "Sonic the Hedgehog 2",
    slug: "sonic-the-hedgehog-2",
    coverUrl: null,
    releaseYear: 1992,
    summary: "Sonic and Tails race through the Genesis classic at full speed.",
    platformIds: [29],
  },
  {
    igdbId: 900018,
    name: "The Legend of Zelda: Ocarina of Time",
    slug: "the-legend-of-zelda-ocarina-of-time",
    coverUrl: null,
    releaseYear: 1998,
    summary:
      "Link travels through time to stop Ganondorf in the N64 masterpiece.",
    platformIds: [4, 21, 37],
  },
];

export function mockSearch(query: string, platformId?: number): IgdbGame[] {
  const q = query.trim().toLowerCase();
  return mockGames
    .filter((g) => g.name.toLowerCase().includes(q))
    .filter((g) => (platformId ? g.platformIds.includes(platformId) : true))
    .slice(0, 24);
}

export function mockGetGame(igdbId: number): IgdbGame | null {
  return mockGames.find((g) => g.igdbId === igdbId) ?? null;
}
