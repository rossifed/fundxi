// ============================================================
// FundXI — Mock Data
// ============================================================

export type Position = "GK" | "CB" | "LB" | "RB" | "CDM" | "CM" | "CAM" | "LW" | "RW" | "ST";

export interface Player {
  id: string;
  name: string;
  number: number;
  team: string;
  teamId: string;
  position: Position;
  nationality: string;
  age: number;
  value: number;          // current value in M€
  previousValue: number;  // value 24h ago
  valueHistory: number[]; // last 10 data points
  stats: {
    goals: number;
    assists: number;
    matches: number;
    rating: number; // 0-10
  };
  foot: "Left" | "Right" | "Both";
  height: number;   // cm
  weight: number;   // kg
  skills: string[];  // short skill tags
  country: string;   // national team country name
  bio: string;       // short description of player capabilities
  image?: string;
}

export interface PriceEvent {
  playerId: string;
  date: string;
  dataIndex: number; // maps to valueHistory index
  text: string;
  impact: "positive" | "negative" | "neutral";
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  logo?: string;
}

export type FixtureStatus = "upcoming" | "live" | "finished";

export interface Fixture {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  status: FixtureStatus;
  date: string;
  score?: { home: number; away: number };
  minute?: number;
  homePlayers: string[]; // player IDs
  awayPlayers: string[]; // player IDs
  events: MatchEvent[];
}

export interface MatchEvent {
  minute: number;
  type: "goal" | "assist" | "yellow" | "red" | "substitution" | "commentary";
  playerId?: string;
  text: string;
}

export interface PortfolioHolding {
  playerId: string;
  quantity: number;
  avgBuyPrice: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  portfolioValue: number;
  pnl: number;
  pnlPercent: number;
}

// ============================================================
// Teams
// ============================================================

export const teams: Team[] = [
  { id: "psg", name: "Paris Saint-Germain", shortName: "PSG", color: "#004170" },
  { id: "rma", name: "Real Madrid", shortName: "RMA", color: "#FEBE10" },
  { id: "bar", name: "FC Barcelona", shortName: "BAR", color: "#A50044" },
  { id: "liv", name: "Liverpool FC", shortName: "LIV", color: "#C8102E" },
  { id: "mci", name: "Manchester City", shortName: "MCI", color: "#6CABDD" },
  { id: "bay", name: "Bayern Munich", shortName: "BAY", color: "#DC052D" },
];

// ============================================================
// Players
// ============================================================

function makeHistory(base: number): number[] {
  const h: number[] = [];
  let v = base * (0.85 + Math.random() * 0.1);
  for (let i = 0; i < 10; i++) {
    v += (Math.random() - 0.45) * base * 0.04;
    h.push(parseFloat(v.toFixed(1)));
  }
  return h;
}

export const players: Player[] = [
  // PSG
  { id: "p1", name: "Ousmane Dembélé", number: 10, team: "Paris Saint-Germain", teamId: "psg", position: "RW", nationality: "🇫🇷", age: 28, value: 72.0, previousValue: 70.5, valueHistory: makeHistory(72), stats: { goals: 12, assists: 9, matches: 28, rating: 7.8 }, foot: "Both", height: 178, weight: 73, skills: ["Pace", "Dribbling", "Crossing", "Flair"], country: "France", bio: "Explosive winger equally dangerous on both flanks. His unpredictable dribbling and ability to use both feet make him a nightmare for defenders. Elite crosser with rapid acceleration and creative flair in the final third." },
  { id: "p2", name: "Achraf Hakimi", number: 2, team: "Paris Saint-Germain", teamId: "psg", position: "RB", nationality: "🇲🇦", age: 27, value: 58.0, previousValue: 57.0, valueHistory: makeHistory(58), stats: { goals: 3, assists: 7, matches: 30, rating: 7.4 }, foot: "Right", height: 181, weight: 73, skills: ["Pace", "Overlapping", "Stamina", "Crossing"], country: "Morocco", bio: "One of the fastest full-backs in world football. Tireless overlapping runs and pinpoint crosses from deep. Strong defensively with the speed to recover and excellent stamina to bomb up and down the flank for 90 minutes." },
  { id: "p3", name: "Marquinhos", number: 5, team: "Paris Saint-Germain", teamId: "psg", position: "CB", nationality: "🇧🇷", age: 31, value: 35.0, previousValue: 36.0, valueHistory: makeHistory(35), stats: { goals: 2, assists: 1, matches: 26, rating: 7.2 }, foot: "Right", height: 183, weight: 75, skills: ["Leadership", "Tackling", "Positioning", "Aerial"], country: "Brazil", bio: "Experienced and intelligent centre-back who reads the game exceptionally well. Natural leader and club captain with impeccable positioning. Comfortable on the ball and dominant in aerial duels despite average height." },
  { id: "p4", name: "Gianluigi Donnarumma", number: 99, team: "Paris Saint-Germain", teamId: "psg", position: "GK", nationality: "🇮🇹", age: 27, value: 42.0, previousValue: 41.5, valueHistory: makeHistory(42), stats: { goals: 0, assists: 0, matches: 30, rating: 7.0 }, foot: "Right", height: 196, weight: 90, skills: ["Reflexes", "Shot Stopping", "Distribution", "Commanding"], country: "Italy", bio: "Towering goalkeeper with lightning reflexes and commanding presence. His enormous wingspan makes him exceptional in one-on-one situations. Good distribution with feet and comfortable playing out from the back." },
  { id: "p5", name: "Vitinha", number: 17, team: "Paris Saint-Germain", teamId: "psg", position: "CM", nationality: "🇵🇹", age: 25, value: 65.0, previousValue: 63.0, valueHistory: makeHistory(65), stats: { goals: 6, assists: 8, matches: 29, rating: 7.6 }, foot: "Right", height: 172, weight: 63, skills: ["Vision", "Passing", "Pressing", "Ball Control"], country: "Portugal", bio: "Technically brilliant midfielder who dictates tempo with precise short and long passing. Relentless pressing and exceptional ball control in tight spaces. Despite his small frame, he wins the ball back with intelligent positioning and anticipation." },
  { id: "p6", name: "Willian Pacho", number: 22, team: "Paris Saint-Germain", teamId: "psg", position: "CB", nationality: "🇪🇨", age: 23, value: 40.0, previousValue: 38.5, valueHistory: makeHistory(40), stats: { goals: 1, assists: 0, matches: 27, rating: 7.1 }, foot: "Left", height: 189, weight: 84, skills: ["Tackling", "Pace", "Aerial", "Composure"], country: "Ecuador", bio: "Athletic left-footed centre-back with impressive recovery speed. Strong in the tackle and dominant in the air. Remarkably composed under pressure for his age, able to play out from the back cleanly even when pressed." },
  { id: "p7", name: "Bradley Barcola", number: 29, team: "Paris Saint-Germain", teamId: "psg", position: "LW", nationality: "🇫🇷", age: 22, value: 55.0, previousValue: 52.0, valueHistory: makeHistory(55), stats: { goals: 10, assists: 5, matches: 28, rating: 7.5 }, foot: "Right", height: 186, weight: 73, skills: ["Pace", "Dribbling", "Finishing", "Acceleration"], country: "France", bio: "Explosive young winger with blistering pace and silky dribbling. Loves to cut inside from the left onto his stronger right foot. Improving his finishing rapidly and becoming a serious goal threat with his direct running style." },
  { id: "p8", name: "Warren Zaïre-Emery", number: 33, team: "Paris Saint-Germain", teamId: "psg", position: "CDM", nationality: "🇫🇷", age: 19, value: 48.0, previousValue: 46.0, valueHistory: makeHistory(48), stats: { goals: 3, assists: 4, matches: 25, rating: 7.3 }, foot: "Right", height: 178, weight: 70, skills: ["Ball Recovery", "Passing", "Composure", "Work Rate"], country: "France", bio: "Prodigious young talent with maturity beyond his years. Excellent ball recovery and distribution from deep. Reads the game intelligently, maintains composure in high-pressure situations, and covers enormous ground with tireless work rate." },
  { id: "p9", name: "Nuno Mendes", number: 25, team: "Paris Saint-Germain", teamId: "psg", position: "LB", nationality: "🇵🇹", age: 23, value: 45.0, previousValue: 44.0, valueHistory: makeHistory(45), stats: { goals: 1, assists: 6, matches: 24, rating: 7.2 }, foot: "Left", height: 176, weight: 70, skills: ["Pace", "Overlapping", "Dribbling", "Defensive"], country: "Portugal", bio: "Dynamic left-back who combines blistering pace with technical dribbling ability. Effective both in attack with overlapping runs and in defence with aggressive tackling. Creates width and provides quality delivery into the box." },
  { id: "p10", name: "Gonçalo Ramos", number: 9, team: "Paris Saint-Germain", teamId: "psg", position: "ST", nationality: "🇵🇹", age: 23, value: 50.0, previousValue: 48.0, valueHistory: makeHistory(50), stats: { goals: 8, assists: 3, matches: 20, rating: 7.1 }, foot: "Right", height: 185, weight: 80, skills: ["Finishing", "Heading", "Hold-up Play", "Positioning"], country: "Portugal", bio: "Clinical striker with natural goal-scoring instinct. Strong in the air and capable of holding the ball up to bring teammates into play. Excellent positioning in the box and composed finishing with either foot." },
  { id: "p11", name: "Fabian Ruiz", number: 8, team: "Paris Saint-Germain", teamId: "psg", position: "CM", nationality: "🇪🇸", age: 29, value: 32.0, previousValue: 32.5, valueHistory: makeHistory(32), stats: { goals: 4, assists: 5, matches: 27, rating: 7.0 }, foot: "Left", height: 189, weight: 78, skills: ["Long Passing", "Vision", "Ball Control", "Shooting"], country: "Spain", bio: "Tall, elegant midfielder with outstanding left-footed passing range. Exceptional vision to pick out runners and switch play. Possesses a powerful long-range shot and silky ball control despite his tall frame." },

  // Real Madrid
  { id: "p12", name: "Vinícius Júnior", number: 7, team: "Real Madrid", teamId: "rma", position: "LW", nationality: "🇧🇷", age: 25, value: 150.0, previousValue: 148.0, valueHistory: makeHistory(150), stats: { goals: 18, assists: 10, matches: 30, rating: 8.5 }, foot: "Right", height: 176, weight: 73, skills: ["Pace", "Dribbling", "Flair", "Acceleration"], country: "Brazil", bio: "Electrifying winger who terrorizes defenders with explosive pace and mesmerizing dribbling. His flair and unpredictability make him virtually unmarkable one-on-one. A big-game player who thrives under pressure and delivers in the biggest moments." },
  { id: "p13", name: "Jude Bellingham", number: 5, team: "Real Madrid", teamId: "rma", position: "CAM", nationality: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", age: 22, value: 130.0, previousValue: 128.0, valueHistory: makeHistory(130), stats: { goals: 15, assists: 8, matches: 29, rating: 8.3 }, foot: "Right", height: 186, weight: 78, skills: ["Box-to-Box", "Finishing", "Leadership", "Aerial"], country: "England", bio: "Complete midfielder who dominates both boxes. Exceptional at arriving late in the penalty area with perfectly timed runs. Natural leader with composure beyond his years, strong in the air, and capable of scoring spectacular goals from any position." },
  { id: "p14", name: "Kylian Mbappé", number: 9, team: "Real Madrid", teamId: "rma", position: "ST", nationality: "🇫🇷", age: 27, value: 160.0, previousValue: 158.0, valueHistory: makeHistory(160), stats: { goals: 20, assists: 5, matches: 28, rating: 8.4 }, foot: "Right", height: 178, weight: 73, skills: ["Pace", "Finishing", "Dribbling", "Off the Ball"], country: "France", bio: "Devastatingly fast striker with world-class finishing ability. His explosive acceleration and intelligent off-the-ball movement create chances out of nothing. Clinical in front of goal with either foot and lethal on the counter-attack." },
  { id: "p15", name: "Thibaut Courtois", number: 1, team: "Real Madrid", teamId: "rma", position: "GK", nationality: "🇧🇪", age: 33, value: 30.0, previousValue: 30.5, valueHistory: makeHistory(30), stats: { goals: 0, assists: 0, matches: 25, rating: 7.5 }, foot: "Left", height: 199, weight: 96, skills: ["Shot Stopping", "Reflexes", "One-on-One", "Commanding"], country: "Belgium", bio: "Imposing goalkeeper whose massive frame covers the goal with ease. World-class shot-stopper with incredible reflexes for his size. Dominant in one-on-one situations and a proven match-winner in Champions League finals." },
  { id: "p16", name: "Antonio Rüdiger", number: 22, team: "Real Madrid", teamId: "rma", position: "CB", nationality: "🇩🇪", age: 32, value: 28.0, previousValue: 28.5, valueHistory: makeHistory(28), stats: { goals: 2, assists: 0, matches: 27, rating: 7.3 }, foot: "Right", height: 190, weight: 85, skills: ["Tackling", "Pace", "Aerial", "Aggression"], country: "Germany", bio: "Powerful and aggressive centre-back with surprising pace for his size. Ferocious in the tackle and dominant in aerial battles. His physical presence and intimidating defending style unsettle opposition attackers." },
  { id: "p17", name: "Federico Valverde", number: 8, team: "Real Madrid", teamId: "rma", position: "CM", nationality: "🇺🇾", age: 27, value: 95.0, previousValue: 93.0, valueHistory: makeHistory(95), stats: { goals: 7, assists: 9, matches: 30, rating: 7.9 }, foot: "Right", height: 182, weight: 78, skills: ["Long Shots", "Stamina", "Box-to-Box", "Versatility"], country: "Uruguay", bio: "Tireless box-to-box midfielder with an incredible engine. Capable of playing multiple positions with equal quality. Possesses a thunderous long-range shot and covers more ground than almost any player in European football." },
  { id: "p18", name: "Éder Militão", number: 3, team: "Real Madrid", teamId: "rma", position: "CB", nationality: "🇧🇷", age: 27, value: 55.0, previousValue: 54.0, valueHistory: makeHistory(55), stats: { goals: 1, assists: 1, matches: 22, rating: 7.2 }, foot: "Right", height: 186, weight: 78, skills: ["Tackling", "Pace", "Composure", "Marking"], country: "Brazil", bio: "Athletic centre-back who combines speed with intelligent defending. Excellent at reading the game and stepping forward to intercept. Strong in one-on-one defending and composed when bringing the ball out from the back." },
  { id: "p19", name: "Rodrygo", number: 11, team: "Real Madrid", teamId: "rma", position: "RW", nationality: "🇧🇷", age: 25, value: 85.0, previousValue: 84.0, valueHistory: makeHistory(85), stats: { goals: 10, assists: 7, matches: 28, rating: 7.7 }, foot: "Right", height: 174, weight: 64, skills: ["Dribbling", "Finishing", "Flair", "Off the Ball"], country: "Brazil", bio: "Silky forward with exceptional close control and creative instincts. Thrives in big European nights with clutch goals and assists. Versatile attacker who can play across the front line with intelligent movement." },
  { id: "p20", name: "Eduardo Camavinga", number: 12, team: "Real Madrid", teamId: "rma", position: "CDM", nationality: "🇫🇷", age: 23, value: 70.0, previousValue: 68.0, valueHistory: makeHistory(70), stats: { goals: 2, assists: 5, matches: 26, rating: 7.4 }, foot: "Left", height: 182, weight: 72, skills: ["Ball Recovery", "Dribbling", "Pressing", "Versatility"], country: "France", bio: "Dynamic young midfielder who excels at winning the ball back and driving forward. Unusually skilled dribbler for a defensive midfielder. His left foot, pressing intensity, and ability to play multiple positions make him invaluable." },
  { id: "p21", name: "Ferland Mendy", number: 23, team: "Real Madrid", teamId: "rma", position: "LB", nationality: "🇫🇷", age: 30, value: 25.0, previousValue: 25.5, valueHistory: makeHistory(25), stats: { goals: 0, assists: 3, matches: 24, rating: 7.0 }, foot: "Left", height: 180, weight: 73, skills: ["Defensive", "Pace", "Tackling", "Stamina"], country: "France", bio: "Defensively rock-solid left-back who rarely gets beaten one-on-one. Uses his pace to recover and shut down opposition attacks. Reliable and consistent performer who prioritizes defensive duties over attacking forays." },
  { id: "p22", name: "Dani Carvajal", number: 2, team: "Real Madrid", teamId: "rma", position: "RB", nationality: "🇪🇸", age: 33, value: 18.0, previousValue: 19.0, valueHistory: makeHistory(18), stats: { goals: 1, assists: 4, matches: 15, rating: 7.1 }, foot: "Right", height: 173, weight: 73, skills: ["Crossing", "Leadership", "Positioning", "Work Rate"], country: "Spain", bio: "Experienced right-back with incredible tactical intelligence. His crossing ability and positional awareness make up for declining pace. A serial winner who delivers in big moments with veteran leadership." },

  // Barcelona
  { id: "p23", name: "Lamine Yamal", number: 19, team: "FC Barcelona", teamId: "bar", position: "RW", nationality: "🇪🇸", age: 18, value: 120.0, previousValue: 115.0, valueHistory: makeHistory(120), stats: { goals: 11, assists: 12, matches: 30, rating: 8.2 }, foot: "Left", height: 180, weight: 72, skills: ["Dribbling", "Vision", "Pace", "Creativity"], country: "Spain", bio: "Generational talent with extraordinary vision and creativity for his age. His left foot produces magical dribbles and defense-splitting passes. Already a key player for both club and country, combining teenage fearlessness with veteran-like decision making." },
  { id: "p24", name: "Raphinha", number: 11, team: "FC Barcelona", teamId: "bar", position: "LW", nationality: "🇧🇷", age: 29, value: 65.0, previousValue: 63.0, valueHistory: makeHistory(65), stats: { goals: 14, assists: 8, matches: 30, rating: 7.9 }, foot: "Left", height: 176, weight: 68, skills: ["Finishing", "Free Kicks", "Dribbling", "Work Rate"], country: "Brazil", bio: "Hardworking winger who combines Brazilian flair with relentless pressing. Deadly from free-kick situations and clinical when cutting inside to shoot. His work rate off the ball sets him apart from other creative players." },
  { id: "p25", name: "Robert Lewandowski", number: 9, team: "FC Barcelona", teamId: "bar", position: "ST", nationality: "🇵🇱", age: 37, value: 15.0, previousValue: 15.5, valueHistory: makeHistory(15), stats: { goals: 22, assists: 4, matches: 30, rating: 8.0 }, foot: "Right", height: 185, weight: 81, skills: ["Finishing", "Positioning", "Heading", "Composure"], country: "Poland", bio: "One of the greatest strikers in history. His positioning and movement in the box remain world-class despite his age. Lethal finisher who can score with either foot or head, combining predatory instinct with intelligent link-up play." },
  { id: "p26", name: "Pedri", number: 8, team: "FC Barcelona", teamId: "bar", position: "CM", nationality: "🇪🇸", age: 23, value: 90.0, previousValue: 88.0, valueHistory: makeHistory(90), stats: { goals: 5, assists: 10, matches: 24, rating: 7.8 }, foot: "Right", height: 174, weight: 63, skills: ["Vision", "Ball Control", "Passing", "Pressing"], country: "Spain", bio: "Silky midfielder in the classic Barcelona mold. Exceptional close control and vision allow him to thread passes through the tightest defenses. His ability to receive under pressure, turn, and play forward makes him the heartbeat of the team." },
  { id: "p27", name: "Gavi", number: 6, team: "FC Barcelona", teamId: "bar", position: "CM", nationality: "🇪🇸", age: 21, value: 60.0, previousValue: 58.0, valueHistory: makeHistory(60), stats: { goals: 3, assists: 6, matches: 20, rating: 7.5 }, foot: "Right", height: 173, weight: 68, skills: ["Pressing", "Aggression", "Ball Recovery", "Passing"], country: "Spain", bio: "Fiery young midfielder who plays with intensity and passion. Exceptional at pressing and winning the ball back high up the pitch. Despite his compact frame, he competes aggressively and drives his team forward with infectious energy." },
  { id: "p28", name: "Marc-André ter Stegen", number: 1, team: "FC Barcelona", teamId: "bar", position: "GK", nationality: "🇩🇪", age: 34, value: 20.0, previousValue: 21.0, valueHistory: makeHistory(20), stats: { goals: 0, assists: 0, matches: 15, rating: 7.3 }, foot: "Right", height: 187, weight: 85, skills: ["Distribution", "Shot Stopping", "Sweeping", "Composure"], country: "Germany", bio: "Ball-playing goalkeeper with distribution skills that rival most outfield players. Exceptional with his feet and comfortable acting as an extra defender. Strong shot-stopper who sweeps effectively behind a high defensive line." },
  { id: "p29", name: "Jules Koundé", number: 23, team: "FC Barcelona", teamId: "bar", position: "RB", nationality: "🇫🇷", age: 27, value: 55.0, previousValue: 54.0, valueHistory: makeHistory(55), stats: { goals: 2, assists: 5, matches: 28, rating: 7.4 }, foot: "Right", height: 180, weight: 75, skills: ["Pace", "Ball Playing", "Tackling", "Overlapping"], country: "France", bio: "Elegant right-back who combines defensive solidity with creative passing. Comfortable inverting into midfield or bombing forward. His pace and tackling make him reliable defensively while his ball-playing ability adds another dimension in attack." },
  { id: "p30", name: "Ronald Araújo", number: 4, team: "FC Barcelona", teamId: "bar", position: "CB", nationality: "🇺🇾", age: 26, value: 50.0, previousValue: 49.0, valueHistory: makeHistory(50), stats: { goals: 1, assists: 0, matches: 18, rating: 7.2 }, foot: "Right", height: 188, weight: 81, skills: ["Aerial", "Tackling", "Pace", "Marking"], country: "Uruguay", bio: "Powerful centre-back who combines raw athleticism with intelligent defending. Dominant in aerial duels and possesses surprising pace for a central defender. His aggressive tackling and man-marking ability make him a formidable opponent." },
  { id: "p31", name: "Pau Cubarsí", number: 2, team: "FC Barcelona", teamId: "bar", position: "CB", nationality: "🇪🇸", age: 18, value: 45.0, previousValue: 42.0, valueHistory: makeHistory(45), stats: { goals: 0, assists: 1, matches: 26, rating: 7.3 }, foot: "Left", height: 184, weight: 77, skills: ["Composure", "Ball Playing", "Positioning", "Tackling"], country: "Spain", bio: "Remarkably mature young defender with composure that belies his age. Excellent ball-playing centre-back who can start attacks from deep. His reading of the game and anticipation compensate for his still-developing physical attributes." },
  { id: "p32", name: "Alejandro Balde", number: 3, team: "FC Barcelona", teamId: "bar", position: "LB", nationality: "🇪🇸", age: 22, value: 35.0, previousValue: 34.0, valueHistory: makeHistory(35), stats: { goals: 1, assists: 4, matches: 25, rating: 7.1 }, foot: "Left", height: 175, weight: 69, skills: ["Pace", "Dribbling", "Overlapping", "Stamina"], country: "Spain", bio: "Electric left-back who drives forward with pace and purpose. Skilled dribbler who can beat his man one-on-one. Provides tireless overlapping runs and has the stamina to contribute both offensively and defensively throughout the match." },
  { id: "p33", name: "Frenkie de Jong", number: 21, team: "FC Barcelona", teamId: "bar", position: "CDM", nationality: "🇳🇱", age: 28, value: 45.0, previousValue: 46.0, valueHistory: makeHistory(45), stats: { goals: 2, assists: 5, matches: 22, rating: 7.2 }, foot: "Right", height: 180, weight: 74, skills: ["Ball Carrying", "Passing", "Vision", "Press Resistance"], country: "Netherlands", bio: "Elegant deep-lying playmaker known for his ability to carry the ball through pressure. Exceptional at breaking lines with progressive runs and precise passing. His press resistance and spatial awareness make him crucial in building play from the back." },

  // Liverpool
  { id: "p34", name: "Mohamed Salah", number: 11, team: "Liverpool FC", teamId: "liv", position: "RW", nationality: "🇪🇬", age: 33, value: 55.0, previousValue: 54.0, valueHistory: makeHistory(55), stats: { goals: 19, assists: 11, matches: 30, rating: 8.3 }, foot: "Left", height: 175, weight: 71, skills: ["Finishing", "Dribbling", "Pace", "Cutting Inside"], country: "Egypt", bio: "One of the Premier League's greatest ever forwards. Devastating when cutting inside from the right onto his lethal left foot. Incredible consistency, elite finishing, and the ability to produce magic in the biggest games season after season." },
  { id: "p35", name: "Virgil van Dijk", number: 4, team: "Liverpool FC", teamId: "liv", position: "CB", nationality: "🇳🇱", age: 34, value: 22.0, previousValue: 23.0, valueHistory: makeHistory(22), stats: { goals: 3, assists: 1, matches: 28, rating: 7.5 }, foot: "Right", height: 193, weight: 92, skills: ["Aerial", "Leadership", "Passing", "Composure"], country: "Netherlands", bio: "Commanding centre-back who transformed Liverpool's defense. Virtually unbeatable in aerial duels and one-on-one situations. His long-range passing and calm composure set the tone for the entire team. A natural-born leader." },
  { id: "p36", name: "Alisson", number: 1, team: "Liverpool FC", teamId: "liv", position: "GK", nationality: "🇧🇷", age: 33, value: 28.0, previousValue: 28.5, valueHistory: makeHistory(28), stats: { goals: 0, assists: 0, matches: 24, rating: 7.4 }, foot: "Right", height: 191, weight: 91, skills: ["Shot Stopping", "Distribution", "Reflexes", "Sweeping"], country: "Brazil", bio: "Complete goalkeeper who excels in every aspect of modern goalkeeping. Outstanding shot-stopper with excellent distribution and sweeping ability. His calm presence and decision-making under pressure provide stability to the defense." },
  { id: "p37", name: "Trent Alexander-Arnold", number: 66, team: "Liverpool FC", teamId: "liv", position: "RB", nationality: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", age: 27, value: 60.0, previousValue: 58.0, valueHistory: makeHistory(60), stats: { goals: 2, assists: 10, matches: 26, rating: 7.7 }, foot: "Right", height: 175, weight: 69, skills: ["Crossing", "Long Passing", "Vision", "Free Kicks"], country: "England", bio: "Revolutionary right-back who plays like a midfielder. His crossing and long-range passing are among the best in world football. Capable of dictating play from deep and delivering pinpoint set pieces. Redefines the full-back position." },
  { id: "p38", name: "Luis Díaz", number: 7, team: "Liverpool FC", teamId: "liv", position: "LW", nationality: "🇨🇴", age: 29, value: 52.0, previousValue: 50.0, valueHistory: makeHistory(52), stats: { goals: 11, assists: 5, matches: 29, rating: 7.6 }, foot: "Right", height: 178, weight: 67, skills: ["Dribbling", "Pace", "Pressing", "Acceleration"], country: "Colombia", bio: "Explosive winger who terrifies defenders with his direct running and rapid acceleration. Relentless in pressing from the front and capable of brilliant individual goals. His electric pace and quick feet make him a constant outlet on the left." },
  { id: "p39", name: "Alexis Mac Allister", number: 10, team: "Liverpool FC", teamId: "liv", position: "CM", nationality: "🇦🇷", age: 27, value: 68.0, previousValue: 66.0, valueHistory: makeHistory(68), stats: { goals: 5, assists: 7, matches: 28, rating: 7.5 }, foot: "Right", height: 174, weight: 72, skills: ["Passing", "Vision", "Ball Control", "Work Rate"], country: "Argentina", bio: "World Cup winner who brings elite passing and tactical intelligence. Dictates tempo with incisive through balls and maintains possession under pressure. His work rate and defensive contribution balance his creative qualities perfectly." },
  { id: "p40", name: "Ryan Gravenberch", number: 38, team: "Liverpool FC", teamId: "liv", position: "CDM", nationality: "🇳🇱", age: 23, value: 50.0, previousValue: 47.0, valueHistory: makeHistory(50), stats: { goals: 3, assists: 4, matches: 30, rating: 7.4 }, foot: "Right", height: 190, weight: 80, skills: ["Ball Carrying", "Pressing", "Passing", "Versatility"], country: "Netherlands", bio: "Tall, athletic midfielder who has flourished as a single pivot. Carries the ball with grace and power through midfield. His long legs and reading of the game make him an excellent ball-winner, while his passing range allows him to launch attacks." },
  { id: "p41", name: "Ibrahima Konaté", number: 5, team: "Liverpool FC", teamId: "liv", position: "CB", nationality: "🇫🇷", age: 26, value: 45.0, previousValue: 44.0, valueHistory: makeHistory(45), stats: { goals: 2, assists: 0, matches: 25, rating: 7.3 }, foot: "Right", height: 194, weight: 89, skills: ["Pace", "Aerial", "Tackling", "Strength"], country: "France", bio: "Physical specimen combining pace, power, and aerial dominance. One of the fastest centre-backs in world football with incredible recovery speed. His aggressive tackling and imposing frame make him a wall in front of goal." },
  { id: "p42", name: "Andrew Robertson", number: 26, team: "Liverpool FC", teamId: "liv", position: "LB", nationality: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", age: 32, value: 18.0, previousValue: 18.5, valueHistory: makeHistory(18), stats: { goals: 1, assists: 6, matches: 24, rating: 7.1 }, foot: "Left", height: 178, weight: 64, skills: ["Crossing", "Stamina", "Work Rate", "Overlapping"], country: "Scotland", bio: "Tireless left-back whose engine never stops running. Provides width and quality crossing from the left flank consistently. His stamina and determination set a standard for work rate, combining attacking threat with solid defensive awareness." },
  { id: "p43", name: "Darwin Núñez", number: 9, team: "Liverpool FC", teamId: "liv", position: "ST", nationality: "🇺🇾", age: 27, value: 62.0, previousValue: 60.0, valueHistory: makeHistory(62), stats: { goals: 14, assists: 4, matches: 28, rating: 7.4 }, foot: "Right", height: 187, weight: 81, skills: ["Pace", "Heading", "Finishing", "Off the Ball"], country: "Uruguay", bio: "Raw and explosive striker who overwhelms defenders with pace and power. Excellent in the air and capable of spectacular goals. His constant movement and direct running create chaos in opposition defenses even when he's not scoring." },
  { id: "p44", name: "Dominik Szoboszlai", number: 8, team: "Liverpool FC", teamId: "liv", position: "CAM", nationality: "🇭🇺", age: 25, value: 55.0, previousValue: 53.0, valueHistory: makeHistory(55), stats: { goals: 6, assists: 8, matches: 27, rating: 7.3 }, foot: "Right", height: 186, weight: 79, skills: ["Long Shots", "Passing", "Pressing", "Creativity"], country: "Hungary", bio: "Dynamic attacking midfielder with a thunderous shot from distance. Combines physical presence with technical quality and creative vision. His pressing intensity and ability to cover ground make him effective both with and without the ball." },
];

// ============================================================
// Fixtures
// ============================================================

export const fixtures: Fixture[] = [
  {
    id: "f1",
    homeTeam: teams[0], // PSG
    awayTeam: teams[1], // Real Madrid
    status: "live",
    date: "2026-03-17T21:00:00",
    score: { home: 1, away: 2 },
    minute: 67,
    homePlayers: ["p4", "p2", "p3", "p6", "p9", "p8", "p5", "p11", "p1", "p7", "p10"],
    awayPlayers: ["p15", "p22", "p16", "p18", "p21", "p20", "p17", "p19", "p13", "p12", "p14"],
    events: [
      { minute: 12, type: "goal", playerId: "p14", text: "⚽ GOAL! Mbappé opens the scoring with a clinical finish!" },
      { minute: 23, type: "commentary", text: "PSG pressing high, Vitinha controlling the tempo." },
      { minute: 34, type: "goal", playerId: "p7", text: "⚽ GOAL! Barcola equalizes with a superb left-footed strike!" },
      { minute: 38, type: "yellow", playerId: "p8", text: "🟨 Yellow card for Zaïre-Emery, late tackle on Valverde." },
      { minute: 45, type: "commentary", text: "Half-time: PSG 1-1 Real Madrid. Intense first half!" },
      { minute: 55, type: "goal", playerId: "p13", text: "⚽ GOAL! Bellingham heads in from Rodrygo's cross!" },
      { minute: 62, type: "commentary", text: "PSG pushing for the equalizer. Dembélé causing problems on the right." },
      { minute: 65, type: "substitution", playerId: "p11", text: "🔄 Fabian Ruiz off, fresh legs coming on for PSG." },
    ],
  },
  {
    id: "f2",
    homeTeam: teams[2], // Barcelona
    awayTeam: teams[3], // Liverpool
    status: "upcoming",
    date: "2026-03-18T21:00:00",
    homePlayers: ["p28", "p29", "p30", "p31", "p32", "p33", "p26", "p27", "p23", "p24", "p25"],
    awayPlayers: ["p36", "p37", "p35", "p41", "p42", "p40", "p39", "p44", "p34", "p38", "p43"],
    events: [],
  },
  {
    id: "f3",
    homeTeam: teams[4], // Man City
    awayTeam: teams[5], // Bayern
    status: "finished",
    date: "2026-03-16T21:00:00",
    score: { home: 3, away: 1 },
    homePlayers: [],
    awayPlayers: [],
    events: [
      { minute: 15, type: "goal", text: "⚽ Man City takes the lead!" },
      { minute: 38, type: "goal", text: "⚽ Bayern equalizes!" },
      { minute: 72, type: "goal", text: "⚽ Man City scores again!" },
      { minute: 88, type: "goal", text: "⚽ Man City seals the victory!" },
    ],
  },
  {
    id: "f4",
    homeTeam: teams[1], // Real Madrid
    awayTeam: teams[2], // Barcelona
    status: "upcoming",
    date: "2026-03-22T21:00:00",
    homePlayers: [],
    awayPlayers: [],
    events: [],
  },
  {
    id: "f5",
    homeTeam: teams[3], // Liverpool
    awayTeam: teams[0], // PSG
    status: "finished",
    date: "2026-03-10T21:00:00",
    score: { home: 2, away: 2 },
    homePlayers: [],
    awayPlayers: [],
    events: [
      { minute: 20, type: "goal", text: "⚽ Liverpool opens the scoring!" },
      { minute: 45, type: "goal", text: "⚽ PSG equalizes before half-time!" },
      { minute: 60, type: "goal", text: "⚽ PSG takes the lead!" },
      { minute: 85, type: "goal", text: "⚽ Liverpool with a late equalizer!" },
    ],
  },
];

// ============================================================
// Portfolio & Leaderboard (mock current user)
// ============================================================

export const myPortfolio: PortfolioHolding[] = [
  { playerId: "p14", quantity: 2, avgBuyPrice: 155.0 },
  { playerId: "p23", quantity: 3, avgBuyPrice: 110.0 },
  { playerId: "p5", quantity: 5, avgBuyPrice: 60.0 },
  { playerId: "p34", quantity: 2, avgBuyPrice: 52.0 },
  { playerId: "p40", quantity: 4, avgBuyPrice: 44.0 },
];

export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, username: "AlphaTrader", portfolioValue: 12450, pnl: 2450, pnlPercent: 24.5 },
  { rank: 2, username: "GoalDigger", portfolioValue: 11800, pnl: 1800, pnlPercent: 18.0 },
  { rank: 3, username: "You", portfolioValue: 11200, pnl: 1200, pnlPercent: 12.0 },
  { rank: 4, username: "FootballFund", portfolioValue: 10900, pnl: 900, pnlPercent: 9.0 },
  { rank: 5, username: "StatsBoss", portfolioValue: 10650, pnl: 650, pnlPercent: 6.5 },
  { rank: 6, username: "PitchInvestor", portfolioValue: 10400, pnl: 400, pnlPercent: 4.0 },
  { rank: 7, username: "TikiTaka", portfolioValue: 10100, pnl: 100, pnlPercent: 1.0 },
  { rank: 8, username: "CounterPress", portfolioValue: 9800, pnl: -200, pnlPercent: -2.0 },
  { rank: 9, username: "CrossMerchant", portfolioValue: 9500, pnl: -500, pnlPercent: -5.0 },
  { rank: 10, username: "BenchWarmer", portfolioValue: 9100, pnl: -900, pnlPercent: -9.0 },
];

// ============================================================
// Helpers
// ============================================================

export function getPlayer(id: string): Player | undefined {
  return players.find((p) => p.id === id);
}

export function getFixture(id: string): Fixture | undefined {
  return fixtures.find((f) => f.id === id);
}

export function getTeamPlayers(teamId: string): Player[] {
  return players.filter((p) => p.teamId === teamId);
}

export function formatValue(v: number): string {
  return `€${v.toFixed(1)}M`;
}

export function pnlColor(v: number): string {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-gray-400";
}

export function pnlSign(v: number): string {
  return v > 0 ? "+" : "";
}

// Position coordinates on pitch (percentage-based, for 4-3-3)
export const positionCoords: Record<Position, { x: number; y: number }> = {
  GK:  { x: 50, y: 92 },
  LB:  { x: 15, y: 72 },
  CB:  { x: 38, y: 78 },
  RB:  { x: 85, y: 72 },
  CDM: { x: 50, y: 58 },
  CM:  { x: 32, y: 48 },
  CAM: { x: 50, y: 38 },
  LW:  { x: 18, y: 25 },
  RW:  { x: 82, y: 25 },
  ST:  { x: 50, y: 12 },
};

// Inverted coords for away team
export function awayCoords(pos: Position): { x: number; y: number } {
  const c = positionCoords[pos];
  return { x: 100 - c.x, y: 100 - c.y };
}

// Get player fixtures (past, live, upcoming)
export function getPlayerFixtures(playerId: string) {
  const player = getPlayer(playerId);
  if (!player) return { past: [], live: [], upcoming: [] };
  return {
    past: fixtures.filter(f => f.status === "finished" && (f.homePlayers.includes(playerId) || f.awayPlayers.includes(playerId) || f.homeTeam.id === player.teamId || f.awayTeam.id === player.teamId)),
    live: fixtures.filter(f => f.status === "live" && (f.homePlayers.includes(playerId) || f.awayPlayers.includes(playerId) || f.homeTeam.id === player.teamId || f.awayTeam.id === player.teamId)),
    upcoming: fixtures.filter(f => f.status === "upcoming" && (f.homeTeam.id === player.teamId || f.awayTeam.id === player.teamId)),
  };
}

// ============================================================
// Price Events (news/events that moved the price)
// ============================================================

// News headlines pool per position type — one for each of the 10 data points
const newsPool: Record<string, { texts: string[]; impacts: PriceEvent["impact"][] }> = {
  GK: {
    texts: [
      "Clean sheet in league opener, commanding display",
      "Costly error leads to conceded goal, confidence questioned",
      "Penalty save in cup match, nerves of steel",
      "Minor finger injury in training, precautionary scan",
      "Back in squad, strong performance in midweek fixture",
      "Distribution stats among top 3 keepers in league",
      "Conceded from set piece, aerial weakness exposed",
      "Double save in derby, man of the match performance",
      "Contract extension talks reportedly underway",
      "Shut out opponents in Champions League, clean sheet streak",
    ],
    impacts: ["positive", "negative", "positive", "negative", "positive", "positive", "negative", "positive", "positive", "positive"],
  },
  DEF: {
    texts: [
      "Solid defensive display, zero chances conceded from his side",
      "Booked for reckless tackle, walking a tightrope",
      "Goal from corner kick header, valuable contribution",
      "Slight muscle fatigue, rested for midweek rotation",
      "Returns to starting XI, dominant in aerial duels",
      "Named in team of the week, impressive stats",
      "Caught out of position for opposition goal",
      "Last-ditch tackle saves a certain goal, crowd erupts",
      "Interest from top clubs, transfer rumors swirling",
      "Clean sheet in big match, defensive masterclass",
    ],
    impacts: ["positive", "negative", "positive", "negative", "positive", "positive", "negative", "positive", "positive", "positive"],
  },
  MID: {
    texts: [
      "Controlled the tempo, 92% pass accuracy in opening match",
      "Anonymous performance in away defeat, subbed at 60'",
      "Assist with brilliant through ball, unlocking the defense",
      "Picked up knock in training, monitored closely",
      "Returned with a goal, composed finish from edge of box",
      "Named player of the month, consistently excellent",
      "Gave ball away leading to counter-attack goal",
      "Two assists in dominant home win, pulling the strings",
      "National team call-up confirmed, form rewarded",
      "Key pass and goal in European match, big-game player",
    ],
    impacts: ["positive", "negative", "positive", "negative", "positive", "positive", "negative", "positive", "positive", "positive"],
  },
  FWD: {
    texts: [
      "Opening day goal, sharp and clinical in front of net",
      "Wasteful in front of goal, missed two clear chances",
      "Brace in cup match, proving his worth to manager",
      "Hamstring tightness, precautionary substitution",
      "Returns from bench to score decisive late winner",
      "Top scorer charts updated — climbing the rankings",
      "Quiet game, well-marshaled by opposition defense",
      "Hat-trick in league, unstoppable on the day",
      "Transfer interest from rival club, value surging",
      "Goal and assist in Champions League, standout display",
    ],
    impacts: ["positive", "negative", "positive", "negative", "positive", "positive", "negative", "positive", "positive", "positive"],
  },
};

function getPositionCategory(pos: Position): string {
  if (pos === "GK") return "GK";
  if (["CB", "LB", "RB"].includes(pos)) return "DEF";
  if (["CDM", "CM", "CAM"].includes(pos)) return "MID";
  return "FWD";
}

// Generate price events for every player, one per data point
function generateAllPriceEvents(): PriceEvent[] {
  const events: PriceEvent[] = [];
  const baseDates = [
    "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12",
    "2026-03-13", "2026-03-14", "2026-03-15", "2026-03-16", "2026-03-17",
  ];
  for (const player of players) {
    const cat = getPositionCategory(player.position);
    const pool = newsPool[cat];
    for (let i = 0; i < 10; i++) {
      events.push({
        playerId: player.id,
        date: baseDates[i],
        dataIndex: i,
        text: pool.texts[i],
        impact: pool.impacts[i],
      });
    }
  }
  return events;
}

export const priceEvents: PriceEvent[] = generateAllPriceEvents();

export function getPlayerPriceEvents(playerId: string): PriceEvent[] {
  return priceEvents.filter(e => e.playerId === playerId);
}
