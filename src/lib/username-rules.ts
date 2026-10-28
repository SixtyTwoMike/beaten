// What a username may not be. Profiles live at /<username>, so names that
// are (or may become) pages are blocked, as are slurs and swearing. A third
// list is reserved: well-known people, companies and games, held back so
// nobody can impersonate them. Reserved names can only be taken with an
// invite issued by `beaten-admin reserve` (see reserved-usernames.ts).
//
// Usernames are already [a-z0-9_]{3,20} by the time these run.

// Top-level paths: every page, plus ones we're likely to add. A new
// top-level route must be added here before it ships.
const ROUTE_NAMES = `
  about account accounts activity admin administrator api app apps assets auth
  beaten blog blocked card cards changelog claim community contact cookies
  dashboard delete diary discover docs download edit email explore export faq
  favicon feed feeds follow followers following forgot_password friends game
  games guide help home import imports index info invite invites jobs join
  legal list lists log login logout logs me members messages mod moderator
  moderators news notifications null official password popular press pricing
  privacy profile profiles random recent register reset reset_password review
  reviews robots root rss search security settings share shelf shelves signin
  signout signup site sitemap staff stats status steam store support system
  team terms top trending undefined user username users verify verify_email
  www xbox playstation nintendo retroachievements
`;

// Matched anywhere in the name (after undoing digit substitutions like
// "sh1t"), so only words that don't hide inside innocent ones.
const PROFANITY_ANYWHERE = `
  fuck fuk fck fuq cunt nigger nigga niggr nigg negro faggot fagot
  shit bitch biatch whore slut twat wank bollock jizz pussy penis
  vagina porn hentai nazi hitler kkk retard tranny kike chink wetback
  pedo paedo pedophile paedophile molest incest rapist bestiality
  motherf cocksuck dickhead asshole arsehole dildo blowjob handjob
  cumshot gangbang orgasm masturbat ejaculat erection boner
  heilhitler siegheil whitepower bigdick dickpic
`;

// Innocent words that contain an entry above; removed before matching.
const ALLOWED_INSIDE = `
  scunthorpe penistone therapist shiitake shitake matsushita torpedo speedo
  pedometer pushit
`;

// Matched only as a whole word (the name, or a part of it between
// underscores/digits), because they're common inside other words:
// "scunthorpe", "assassin", "peacock", "dickens", "grape", "analog".
const PROFANITY_WHOLE = `
  ass arse cock dick dicks cum rape raped sex sexy nude nudes anal anus
  tit tits titty boob boobs spic coon paki dyke fag fags homo gook
  slag skank hoe hoes milf nsfw xxx crap piss poop
`;

// Well-known people, studios, platforms and games. Claimable only through
// an admin invite, so e.g. a studio can be handed its own name.
const RESERVED = `
  nintendo sony playstation xbox microsoft sega valve steam epic epicgames
  ubisoft ea electronicarts activision blizzard bethesda rockstar
  rockstargames capcom konami bandainamco squareenix fromsoftware
  cdprojekt cdprojektred naughtydog insomniac santamonica bungie riot
  riotgames mojang minecraft fortnite roblox atari gog itchio
  twitch youtube igdb backloggd letterboxd howlongtobeat
  mario luigi zelda link pikachu pokemon sonic kirby metroid samus
  masterchief kratos geralt lara laracroft
  miyamoto shigerumiyamoto kojima hideokojima miyazaki hidetakamiyazaki
  sakurai iwata satoruiwata reggie todd toddhoward cliffyb neil
  neildruckmann amyhennig yokotaro taro suda51 phil philspencer
  gabe gabenewell gaben shuhei shuheiyoshida jimryan
  pewdiepie ninja shroud markiplier jacksepticeye xqc pokimane
  dunkey videogamedunkey jacksfilms angryjoe giantbomb ign gamespot
  polygon kotaku eurogamer digitalfoundry
`;

const words = (list: string) => new Set(list.trim().split(/\s+/));
const ROUTES = words(ROUTE_NAMES);
const ANYWHERE = [...words(PROFANITY_ANYWHERE)];
const ALLOWED = [...words(ALLOWED_INSIDE)];
const WHOLE = words(PROFANITY_WHOLE);
const RESERVED_NAMES = words(RESERVED);

// "sh1t", "a55", "f4g" → letters. Applied as an alternative reading, so
// names with real digits ("player1") are still judged on their own too.
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s" };

function readings(username: string): string[] {
  const plain = username.replace(/_/g, "");
  const leet = plain.replace(/[0-9]/g, (d) => LEET[d] ?? d);
  // "fuuuuck" → "fuck"
  const squeezed = leet.replace(/(.)\1+/g, "$1");
  return [plain, leet, squeezed];
}

function parts(username: string): string[] {
  const leet = username.replace(/[0-9]/g, (d) => LEET[d] ?? d);
  return [
    username.replace(/_/g, ""),
    leet.replace(/_/g, ""),
    ...username.split(/[_0-9]+/),
    ...leet.split(/_+/),
  ].filter(Boolean);
}

export function isRouteName(username: string): boolean {
  return ROUTES.has(username) || ROUTES.has(username.replace(/_/g, ""));
}

export function isProfane(username: string): boolean {
  const cleaned = readings(username).map((r) => ALLOWED.reduce((t, w) => t.split(w).join("_"), r));
  if (cleaned.some((r) => ANYWHERE.some((w) => r.includes(w)))) return true;
  return parts(username).some((p) => WHOLE.has(p) || WHOLE.has(p.replace(/(.)\1+/g, "$1")));
}

// Built-in reserved names (the database holds more; see reserved-usernames.ts).
export function isBuiltInReserved(username: string): boolean {
  return RESERVED_NAMES.has(username.replace(/_/g, ""));
}
