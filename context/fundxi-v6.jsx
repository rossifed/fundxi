import { useState, useMemo } from "react";

/* ═══════════════════════════════════════════════
   FUNDXI MOBILE v3 — Exact desktop feature parity
   ═══════════════════════════════════════════════ */

const N={
  // CONMEBOL (6)
  ARG:{n:"Argentina",f:"🇦🇷",cl:"#75AADB",c:"CONMEBOL",g:"A"},BRA:{n:"Brazil",f:"🇧🇷",cl:"#009C3B",c:"CONMEBOL",g:"G"},URU:{n:"Uruguay",f:"🇺🇾",cl:"#001489",c:"CONMEBOL",g:"H"},COL:{n:"Colombia",f:"🇨🇴",cl:"#FCD116",c:"CONMEBOL",g:"D"},ECU:{n:"Ecuador",f:"🇪🇨",cl:"#FFD100",c:"CONMEBOL",g:"K"},PAR:{n:"Paraguay",f:"🇵🇾",cl:"#DA121A",c:"CONMEBOL",g:"L"},
  // UEFA (12 confirmed + 4 playoff TBD)
  FRA:{n:"France",f:"🇫🇷",cl:"#002395",c:"UEFA",g:"D"},ENG:{n:"England",f:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",cl:"#CF081F",c:"UEFA",g:"B"},ESP:{n:"Spain",f:"🇪🇸",cl:"#AA151B",c:"UEFA",g:"E"},GER:{n:"Germany",f:"🇩🇪",cl:"#222",c:"UEFA",g:"F"},POR:{n:"Portugal",f:"🇵🇹",cl:"#006847",c:"UEFA",g:"I"},NED:{n:"Netherlands",f:"🇳🇱",cl:"#FF6600",c:"UEFA",g:"C"},BEL:{n:"Belgium",f:"🇧🇪",cl:"#ED2939",c:"UEFA",g:"J"},CRO:{n:"Croatia",f:"🇭🇷",cl:"#FF0000",c:"UEFA",g:"G"},SUI:{n:"Switzerland",f:"🇨🇭",cl:"#D52B1E",c:"UEFA",g:"L"},AUT:{n:"Austria",f:"🇦🇹",cl:"#EF3340",c:"UEFA",g:"F"},NOR:{n:"Norway",f:"🇳🇴",cl:"#BA0C2F",c:"UEFA",g:"H"},SCO:{n:"Scotland",f:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",cl:"#003078",c:"UEFA",g:"I"},
  // UEFA Playoffs (finals today Mar 31 — showing favorites)
  ITA:{n:"Italy",f:"🇮🇹",cl:"#006AB6",c:"UEFA",g:"B"},SWE:{n:"Sweden",f:"🇸🇪",cl:"#006AA7",c:"UEFA",g:"C"},TUR:{n:"Türkiye",f:"🇹🇷",cl:"#E30A17",c:"UEFA",g:"J"},DEN:{n:"Denmark",f:"🇩🇰",cl:"#C8102E",c:"UEFA",g:"K"},
  // CONCACAF (3 hosts + 3 qualified)
  USA:{n:"United States",f:"🇺🇸",cl:"#002868",c:"CONCACAF",g:"B"},MEX:{n:"Mexico",f:"🇲🇽",cl:"#006847",c:"CONCACAF",g:"A"},CAN:{n:"Canada",f:"🇨🇦",cl:"#FF0000",c:"CONCACAF",g:"C"},PAN:{n:"Panama",f:"🇵🇦",cl:"#D21034",c:"CONCACAF",g:"F"},CUR:{n:"Curaçao",f:"🇨🇼",cl:"#002B7F",c:"CONCACAF",g:"L"},HAI:{n:"Haiti",f:"🇭🇹",cl:"#00209F",c:"CONCACAF",g:"I"},
  // AFC (8)
  JPN:{n:"Japan",f:"🇯🇵",cl:"#BC002D",c:"AFC",g:"E"},IRN:{n:"Iran",f:"🇮🇷",cl:"#239F40",c:"AFC",g:"A"},KOR:{n:"South Korea",f:"🇰🇷",cl:"#C60C30",c:"AFC",g:"H"},AUS:{n:"Australia",f:"🇦🇺",cl:"#00843D",c:"AFC",g:"G"},KSA:{n:"Saudi Arabia",f:"🇸🇦",cl:"#006C35",c:"AFC",g:"D"},QAT:{n:"Qatar",f:"🇶🇦",cl:"#8A1538",c:"AFC",g:"A"},UZB:{n:"Uzbekistan",f:"🇺🇿",cl:"#0099B5",c:"AFC",g:"K"},JOR:{n:"Jordan",f:"🇯🇴",cl:"#007A3D",c:"AFC",g:"F"},
  // CAF (9)
  MAR:{n:"Morocco",f:"🇲🇦",cl:"#C1272D",c:"CAF",g:"A"},SEN:{n:"Senegal",f:"🇸🇳",cl:"#00853F",c:"CAF",g:"I"},EGY:{n:"Egypt",f:"🇪🇬",cl:"#C8102E",c:"CAF",g:"E"},ALG:{n:"Algeria",f:"🇩🇿",cl:"#006233",c:"CAF",g:"H"},TUN:{n:"Tunisia",f:"🇹🇳",cl:"#E70013",c:"CAF",g:"D"},RSA:{n:"South Africa",f:"🇿🇦",cl:"#007749",c:"CAF",g:"C"},CIV:{n:"Ivory Coast",f:"🇨🇮",cl:"#F77F00",c:"CAF",g:"G"},GHA:{n:"Ghana",f:"🇬🇭",cl:"#006B3F",c:"CAF",g:"J"},CPV:{n:"Cape Verde",f:"🇨🇻",cl:"#003893",c:"CAF",g:"L"},
  // OFC (1)
  NZL:{n:"New Zealand",f:"🇳🇿",cl:"#000000",c:"OFC",g:"E"},
};

const P=[
{id:1,nm:"Messi",fn:"Lionel Messi",num:10,nt:"ARG",pos:"FW",v:180,ch:1.2,rt:95,tg:["Vision","Finishing","Dribbling","Free Kicks","Playmaking"],age:38,foot:"Left",ht:"170cm",wt:"72kg",club:"Inter Miami",bio:"The greatest of all time entering his final World Cup. Eight Ballon d'Or winner, 2022 World Cup champion."},
{id:2,nm:"J. Álvarez",fn:"Julián Álvarez",num:9,nt:"ARG",pos:"FW",v:120,ch:3.4,rt:88,tg:["Pressing","Finishing","Work Rate","Movement"],age:26,foot:"Right",ht:"170cm",wt:"71kg",club:"Atlético Madrid",bio:"Tireless forward combining relentless pressing with clinical finishing."},
{id:3,nm:"Mac Allister",fn:"Alexis Mac Allister",num:20,nt:"ARG",pos:"MF",v:95,ch:2.8,rt:87,tg:["Passing","Vision","Ball Control","Composure"],age:27,foot:"Right",ht:"176cm",wt:"72kg",club:"Liverpool",bio:"Elegant midfielder who controls the tempo."},
{id:4,nm:"Vinícius Jr",fn:"Vinícius Júnior",num:7,nt:"BRA",pos:"FW",v:175,ch:2.1,rt:93,tg:["Pace","Dribbling","Flair","1v1","Acceleration"],age:25,foot:"Right",ht:"176cm",wt:"73kg",club:"Real Madrid",bio:"Explosive winger. Ballon d'Or winner and Brazil's biggest threat."},
{id:5,nm:"Rodrygo",fn:"Rodrygo",num:11,nt:"BRA",pos:"FW",v:98,ch:1.5,rt:87,tg:["Dribbling","Finishing","Versatility"],age:25,foot:"Right",ht:"174cm",wt:"64kg",club:"Real Madrid",bio:"Versatile attacker with ice-cold composure."},
{id:6,nm:"Endrick",fn:"Endrick Felipe",num:21,nt:"BRA",pos:"FW",v:72,ch:8.2,rt:82,tg:["Pace","Power","Youth","Finishing"],age:19,foot:"Left",ht:"173cm",wt:"72kg",club:"Real Madrid",bio:"Teenage sensation making his World Cup debut."},
{id:7,nm:"Mbappé",fn:"Kylian Mbappé",num:10,nt:"FRA",pos:"FW",v:195,ch:3.2,rt:95,tg:["Pace","Finishing","Dribbling","Movement","Leadership"],age:27,foot:"Right",ht:"178cm",wt:"73kg",club:"Real Madrid",bio:"France's captain and the fastest player in world football."},
{id:8,nm:"Dembélé",fn:"Ousmane Dembélé",num:11,nt:"FRA",pos:"FW",v:82,ch:2.4,rt:86,tg:["Pace","Dribbling","Both Feet","Crossing"],age:29,foot:"Both",ht:"178cm",wt:"67kg",club:"PSG",bio:"Unpredictable winger equally dangerous on either foot."},
{id:9,nm:"Barcola",fn:"Bradley Barcola",num:29,nt:"FRA",pos:"FW",v:62,ch:6.1,rt:83,tg:["Pace","Dribbling","Youth","Direct"],age:22,foot:"Left",ht:"186cm",wt:"72kg",club:"PSG",bio:"Young French sensation with silky dribbling."},
{id:10,nm:"Camavinga",fn:"Eduardo Camavinga",num:12,nt:"FRA",pos:"MF",v:78,ch:1.5,rt:85,tg:["Recovery","Pressing","Dribbling","Versatility"],age:23,foot:"Left",ht:"182cm",wt:"68kg",club:"Real Madrid",bio:"Dynamic midfielder combining intensity with elegance."},
{id:11,nm:"Tchouaméni",fn:"Aurélien Tchouaméni",num:8,nt:"FRA",pos:"MF",v:88,ch:1.8,rt:87,tg:["Tackling","Passing","Long Range","Positioning"],age:26,foot:"Right",ht:"187cm",wt:"81kg",club:"Real Madrid",bio:"Complete defensive midfielder with tactical intelligence."},
{id:51,nm:"Saliba",fn:"William Saliba",num:2,nt:"FRA",pos:"DF",v:85,ch:3.0,rt:88,tg:["Composure","Tackling","Ball Playing","Aerial"],age:25,foot:"Right",ht:"192cm",wt:"82kg",club:"Arsenal",bio:"Rock-solid centre-back."},
{id:60,nm:"Upamecano",fn:"Dayot Upamecano",num:4,nt:"FRA",pos:"DF",v:55,ch:1.2,rt:83,tg:["Pace","Aerial","Strength"],age:27,foot:"Right",ht:"186cm",wt:"80kg",club:"Bayern Munich",bio:"Powerful centre-back."},
{id:61,nm:"T. Hernández",fn:"Theo Hernández",num:22,nt:"FRA",pos:"DF",v:62,ch:0.8,rt:84,tg:["Overlapping","Crossing","Pace"],age:28,foot:"Left",ht:"184cm",wt:"81kg",club:"AC Milan",bio:"Marauding left-back."},
{id:62,nm:"Koundé",fn:"Jules Koundé",num:5,nt:"FRA",pos:"DF",v:60,ch:1.5,rt:85,tg:["Ball Playing","Pace","Intelligence"],age:27,foot:"Right",ht:"180cm",wt:"75kg",club:"FC Barcelona",bio:"Modern full-back."},
{id:63,nm:"Maignan",fn:"Mike Maignan",num:1,nt:"FRA",pos:"GK",v:48,ch:0.5,rt:87,tg:["Reflexes","Distribution","Command"],age:31,foot:"Right",ht:"191cm",wt:"85kg",club:"AC Milan",bio:"France's commanding number one."},
{id:12,nm:"Bellingham",fn:"Jude Bellingham",num:10,nt:"ENG",pos:"MF",v:165,ch:2.0,rt:93,tg:["Box-to-Box","Finishing","Leadership","Aerial","Driving Runs"],age:22,foot:"Right",ht:"186cm",wt:"75kg",club:"Real Madrid",bio:"England's generational talent."},
{id:13,nm:"Saka",fn:"Bukayo Saka",num:7,nt:"ENG",pos:"FW",v:140,ch:1.9,rt:91,tg:["Dribbling","Crossing","Finishing","Intelligence"],age:24,foot:"Left",ht:"178cm",wt:"72kg",club:"Arsenal",bio:"England's most consistent attacker."},
{id:14,nm:"Rice",fn:"Declan Rice",num:4,nt:"ENG",pos:"MF",v:110,ch:1.3,rt:89,tg:["Recovery","Passing","Leadership","Carrying"],age:27,foot:"Right",ht:"185cm",wt:"80kg",club:"Arsenal",bio:"England's midfield anchor."},
{id:15,nm:"Foden",fn:"Phil Foden",num:11,nt:"ENG",pos:"MF",v:120,ch:0.8,rt:90,tg:["Vision","Dribbling","Finishing","Technique"],age:26,foot:"Left",ht:"171cm",wt:"69kg",club:"Manchester City",bio:"The Stockport Iniesta."},
{id:16,nm:"Yamal",fn:"Lamine Yamal",num:19,nt:"ESP",pos:"FW",v:155,ch:5.2,rt:90,tg:["Dribbling","Vision","Pace","Creativity","Youth"],age:18,foot:"Left",ht:"180cm",wt:"68kg",club:"FC Barcelona",bio:"The youngest star in world football."},
{id:17,nm:"Pedri",fn:"Pedri",num:8,nt:"ESP",pos:"MF",v:105,ch:2.5,rt:89,tg:["Vision","Ball Control","Passing","Composure"],age:23,foot:"Right",ht:"174cm",wt:"63kg",club:"FC Barcelona",bio:"Spain's metronome."},
{id:18,nm:"Rodri",fn:"Rodri",num:6,nt:"ESP",pos:"MF",v:130,ch:1.1,rt:92,tg:["Positioning","Composure","Passing","Tackling"],age:30,foot:"Right",ht:"191cm",wt:"82kg",club:"Manchester City",bio:"Ballon d'Or winner 2024."},
{id:20,nm:"Musiala",fn:"Jamal Musiala",num:10,nt:"GER",pos:"MF",v:145,ch:3.1,rt:90,tg:["Dribbling","Vision","Close Control","Agility"],age:23,foot:"Right",ht:"183cm",wt:"72kg",club:"Bayern Munich",bio:"Germany's dazzling playmaker."},
{id:21,nm:"Wirtz",fn:"Florian Wirtz",num:17,nt:"GER",pos:"MF",v:140,ch:4.5,rt:89,tg:["Creativity","Finishing","Through Balls"],age:23,foot:"Right",ht:"176cm",wt:"70kg",club:"Bayer Leverkusen",bio:"Leverkusen's invincible architect."},
{id:26,nm:"Haaland",fn:"Erling Haaland",num:9,nt:"NOR",pos:"FW",v:185,ch:1.6,rt:94,tg:["Finishing","Strength","Pace","Aerial"],age:25,foot:"Left",ht:"194cm",wt:"88kg",club:"Manchester City",bio:"A goalscoring machine."},
{id:27,nm:"Ødegaard",fn:"Martin Ødegaard",num:8,nt:"NOR",pos:"MF",v:115,ch:2.2,rt:90,tg:["Vision","Creativity","Passing","Set Pieces"],age:27,foot:"Left",ht:"178cm",wt:"68kg",club:"Arsenal",bio:"Norway's creative heartbeat."},
{id:32,nm:"Hakimi",fn:"Achraf Hakimi",num:2,nt:"MAR",pos:"DF",v:75,ch:2.1,rt:87,tg:["Pace","Overlapping","Stamina"],age:27,foot:"Right",ht:"181cm",wt:"73kg",club:"PSG",bio:"The fastest full-back."},
{id:36,nm:"Son",fn:"Son Heung-min",num:7,nt:"KOR",pos:"FW",v:72,ch:0.5,rt:87,tg:["Finishing","Pace","Both Feet"],age:33,foot:"Both",ht:"183cm",wt:"78kg",club:"Tottenham",bio:"South Korea's all-time top scorer."},
{id:37,nm:"Kim",fn:"Kim Min-jae",num:3,nt:"KOR",pos:"DF",v:65,ch:2.0,rt:86,tg:["Tackling","Aerial","Pace"],age:29,foot:"Right",ht:"190cm",wt:"88kg",club:"Bayern Munich",bio:"Asia's best defender."},
{id:38,nm:"Salah",fn:"Mohamed Salah",num:10,nt:"EGY",pos:"FW",v:88,ch:1.2,rt:89,tg:["Finishing","Dribbling","Pace"],age:33,foot:"Left",ht:"175cm",wt:"71kg",club:"Liverpool",bio:"The Egyptian King."},
{id:39,nm:"Marmoush",fn:"Omar Marmoush",num:22,nt:"EGY",pos:"FW",v:72,ch:9.5,rt:84,tg:["Pace","Pressing","Finishing"],age:25,foot:"Right",ht:"183cm",wt:"75kg",club:"Manchester City",bio:"Egypt's breakout star."},
{id:40,nm:"Pulisic",fn:"Christian Pulisic",num:10,nt:"USA",pos:"MF",v:68,ch:2.5,rt:84,tg:["Dribbling","Creativity","Versatility"],age:27,foot:"Right",ht:"177cm",wt:"73kg",club:"AC Milan",bio:"Captain America."},
{id:42,nm:"Valverde",fn:"Federico Valverde",num:15,nt:"URU",pos:"MF",v:110,ch:2.4,rt:89,tg:["Long Shots","Stamina","Box-to-Box"],age:27,foot:"Right",ht:"182cm",wt:"78kg",club:"Real Madrid",bio:"An engine that never stops."},
{id:43,nm:"D. Núñez",fn:"Darwin Núñez",num:9,nt:"URU",pos:"FW",v:78,ch:3.6,rt:85,tg:["Pace","Heading","Chaos"],age:27,foot:"Right",ht:"187cm",wt:"81kg",club:"Liverpool",bio:"Unpredictable and explosive."},
{id:44,nm:"Araújo",fn:"Ronald Araújo",num:4,nt:"URU",pos:"DF",v:65,ch:1.9,rt:85,tg:["Aerial","Tackling","Pace"],age:27,foot:"Right",ht:"188cm",wt:"84kg",club:"FC Barcelona",bio:"One of the fastest centre-backs."},
{id:45,nm:"De Bruyne",fn:"Kevin De Bruyne",num:7,nt:"BEL",pos:"MF",v:82,ch:-0.8,rt:90,tg:["Vision","Long Passing","Shooting"],age:35,foot:"Right",ht:"181cm",wt:"68kg",club:"Manchester City",bio:"Belgium's maestro."},
{id:47,nm:"L. Díaz",fn:"Luis Díaz",num:7,nt:"COL",pos:"FW",v:75,ch:-1.8,rt:85,tg:["Dribbling","Pressing","Pace"],age:29,foot:"Right",ht:"178cm",wt:"65kg",club:"Liverpool",bio:"Colombia's electric winger."},
{id:48,nm:"J. David",fn:"Jonathan David",num:20,nt:"CAN",pos:"FW",v:72,ch:3.5,rt:83,tg:["Finishing","Movement"],age:26,foot:"Right",ht:"180cm",wt:"74kg",club:"Arsenal",bio:"Canada's talisman."},
{id:49,nm:"A. Davies",fn:"Alphonso Davies",num:19,nt:"CAN",pos:"DF",v:80,ch:2.0,rt:86,tg:["Pace","Overlapping","Dribbling"],age:25,foot:"Left",ht:"183cm",wt:"76kg",club:"Real Madrid",bio:"The fastest left-back on the planet."},
{id:50,nm:"Kudus",fn:"Mohammed Kudus",num:10,nt:"GHA",pos:"MF",v:65,ch:5.2,rt:83,tg:["Dribbling","Long Shots","Skill"],age:25,foot:"Right",ht:"177cm",wt:"70kg",club:"West Ham",bio:"Ghana's most exciting talent."},
{id:31,nm:"Gvardiol",fn:"Joško Gvardiol",num:24,nt:"CRO",pos:"DF",v:80,ch:3.8,rt:86,tg:["Ball Playing","Tackling"],age:24,foot:"Left",ht:"185cm",wt:"82kg",club:"Manchester City",bio:"Modern ball-playing centre-back."},
{id:53,nm:"Alisson",fn:"Alisson Becker",num:1,nt:"BRA",pos:"GK",v:45,ch:0.5,rt:88,tg:["Distribution","Reflexes"],age:33,foot:"Right",ht:"193cm",wt:"91kg",club:"Liverpool",bio:"The complete goalkeeper."},
{id:25,nm:"Leão",fn:"Rafael Leão",num:17,nt:"POR",pos:"FW",v:95,ch:3.0,rt:87,tg:["Pace","Dribbling","Flair"],age:27,foot:"Left",ht:"188cm",wt:"81kg",club:"AC Milan",bio:"Portugal's lightning bolt."},
{id:23,nm:"Ronaldo",fn:"Cristiano Ronaldo",num:7,nt:"POR",pos:"FW",v:60,ch:-1.5,rt:84,tg:["Finishing","Aerial","Leadership"],age:41,foot:"Right",ht:"187cm",wt:"85kg",club:"Al Nassr",bio:"All-time international top scorer at his final World Cup."},
{id:24,nm:"Bruno F.",fn:"Bruno Fernandes",num:8,nt:"POR",pos:"MF",v:90,ch:1.8,rt:88,tg:["Vision","Long Shots","Set Pieces"],age:31,foot:"Right",ht:"179cm",wt:"69kg",club:"Manchester United",bio:"Portugal's creative engine."},
{id:28,nm:"Gakpo",fn:"Cody Gakpo",num:11,nt:"NED",pos:"FW",v:85,ch:3.5,rt:85,tg:["Finishing","Pace","Aerial"],age:25,foot:"Right",ht:"189cm",wt:"82kg",club:"Liverpool",bio:"Netherlands' most dangerous attacker."},
{id:52,nm:"Van Dijk",fn:"Virgil van Dijk",num:4,nt:"NED",pos:"DF",v:35,ch:-2.2,rt:85,tg:["Aerial","Leadership","Composure"],age:34,foot:"Right",ht:"193cm",wt:"92kg",club:"Liverpool",bio:"The Dutch colossus."},
{id:54,nm:"Courtois",fn:"Thibaut Courtois",num:1,nt:"BEL",pos:"GK",v:42,ch:-1.0,rt:88,tg:["Shot Stopping","Reflexes"],age:34,foot:"Left",ht:"199cm",wt:"96kg",club:"Real Madrid",bio:"A wall between the posts."},
// ── Missing teams: 2 players each ──
// Switzerland
{id:100,nm:"Xhaka",fn:"Granit Xhaka",num:10,nt:"SUI",pos:"MF",v:52,ch:1.4,rt:85,tg:["Leadership","Passing","Long Range"],age:33,foot:"Left",ht:"185cm",wt:"82kg",club:"Bayer Leverkusen",bio:"Switzerland's captain and midfield general."},
{id:101,nm:"Akanji",fn:"Manuel Akanji",num:5,nt:"SUI",pos:"DF",v:55,ch:0.8,rt:84,tg:["Ball Playing","Composure"],age:29,foot:"Right",ht:"187cm",wt:"85kg",club:"Manchester City",bio:"Elite centre-back with a Treble winner's mentality."},
// Austria
{id:102,nm:"Sabitzer",fn:"Marcel Sabitzer",num:7,nt:"AUT",pos:"MF",v:38,ch:1.5,rt:82,tg:["Box-to-Box","Long Shots"],age:32,foot:"Right",ht:"178cm",wt:"72kg",club:"Borussia Dortmund",bio:"Austria's tireless engine."},
{id:103,nm:"Laimer",fn:"Konrad Laimer",num:8,nt:"AUT",pos:"MF",v:35,ch:0.9,rt:80,tg:["Pressing","Stamina"],age:27,foot:"Right",ht:"180cm",wt:"75kg",club:"Bayern Munich",bio:"Relentless pressing machine."},
// Scotland
{id:104,nm:"McTominay",fn:"Scott McTominay",num:8,nt:"SCO",pos:"MF",v:48,ch:2.8,rt:82,tg:["Aerial","Box-to-Box","Finishing"],age:29,foot:"Right",ht:"191cm",wt:"84kg",club:"Napoli",bio:"Scotland's midfield goal threat."},
{id:105,nm:"Robertson",fn:"Andrew Robertson",num:3,nt:"SCO",pos:"DF",v:32,ch:0.5,rt:81,tg:["Crossing","Overlapping","Leadership"],age:32,foot:"Left",ht:"178cm",wt:"72kg",club:"Liverpool",bio:"Scotland's captain and world-class left-back."},
// Italy
{id:106,nm:"Donnarumma",fn:"Gianluigi Donnarumma",num:1,nt:"ITA",pos:"GK",v:48,ch:0.3,rt:86,tg:["Reflexes","1v1","Command"],age:27,foot:"Right",ht:"196cm",wt:"90kg",club:"PSG",bio:"Italy's towering goalkeeper."},
{id:107,nm:"Barella",fn:"Nicolò Barella",num:18,nt:"ITA",pos:"MF",v:78,ch:2.2,rt:87,tg:["Box-to-Box","Long Shots","Passing"],age:29,foot:"Right",ht:"172cm",wt:"68kg",club:"Inter Milan",bio:"Italy's most complete midfielder."},
// Sweden
{id:108,nm:"Isak",fn:"Alexander Isak",num:11,nt:"SWE",pos:"FW",v:95,ch:3.5,rt:87,tg:["Finishing","Dribbling","Pace"],age:26,foot:"Right",ht:"190cm",wt:"80kg",club:"Newcastle",bio:"Sweden's elegant striker."},
{id:109,nm:"Kulusevski",fn:"Dejan Kulusevski",num:21,nt:"SWE",pos:"FW",v:68,ch:2.0,rt:84,tg:["Dribbling","Vision","Versatility"],age:26,foot:"Left",ht:"186cm",wt:"78kg",club:"Tottenham",bio:"Dynamic attacker who can play anywhere in the front line."},
// Türkiye
{id:110,nm:"Çalhanoğlu",fn:"Hakan Çalhanoğlu",num:10,nt:"TUR",pos:"MF",v:62,ch:1.5,rt:85,tg:["Free Kicks","Passing","Long Range"],age:32,foot:"Right",ht:"178cm",wt:"74kg",club:"Inter Milan",bio:"Türkiye's dead-ball specialist and midfield conductor."},
{id:111,nm:"Yıldız",fn:"Kenan Yıldız",num:18,nt:"TUR",pos:"FW",v:55,ch:6.8,rt:82,tg:["Dribbling","Youth","Creativity"],age:21,foot:"Right",ht:"184cm",wt:"72kg",club:"Juventus",bio:"Türkiye's rising star."},
// Denmark
{id:112,nm:"Eriksen",fn:"Christian Eriksen",num:10,nt:"DEN",pos:"MF",v:28,ch:-0.5,rt:82,tg:["Vision","Set Pieces","Passing"],age:34,foot:"Right",ht:"182cm",wt:"76kg",club:"Manchester United",bio:"Denmark's creative heart — an inspirational comeback story."},
{id:113,nm:"Højlund",fn:"Rasmus Højlund",num:9,nt:"DEN",pos:"FW",v:62,ch:3.2,rt:83,tg:["Pace","Finishing","Power"],age:23,foot:"Right",ht:"191cm",wt:"84kg",club:"Manchester United",bio:"Denmark's young powerhouse striker."},
// Mexico
{id:114,nm:"Lozano",fn:"Hirving Lozano",num:22,nt:"MEX",pos:"FW",v:28,ch:0.5,rt:79,tg:["Pace","Dribbling","Direct"],age:30,foot:"Right",ht:"175cm",wt:"70kg",club:"PSV",bio:"El Chucky — Mexico's explosive winger."},
{id:115,nm:"Edson Álvarez",fn:"Edson Álvarez",num:4,nt:"MEX",pos:"MF",v:42,ch:1.2,rt:82,tg:["Tackling","Aerial","Leadership"],age:28,foot:"Right",ht:"187cm",wt:"80kg",club:"West Ham",bio:"Mexico's midfield destroyer."},
// Panama
{id:116,nm:"Fajardo",fn:"José Fajardo",num:9,nt:"PAN",pos:"FW",v:12,ch:2.5,rt:73,tg:["Finishing","Movement"],age:26,foot:"Right",ht:"180cm",wt:"75kg",club:"Saprissa",bio:"Panama's leading striker."},
{id:117,nm:"Godoy",fn:"Adalberto Carrasquilla",num:10,nt:"PAN",pos:"MF",v:10,ch:1.0,rt:72,tg:["Creativity","Passing"],age:27,foot:"Right",ht:"168cm",wt:"62kg",club:"Houston Dynamo",bio:"Panama's playmaker."},
// Curaçao
{id:118,nm:"Bacuna",fn:"Leandro Bacuna",num:7,nt:"CUR",pos:"MF",v:6,ch:3.5,rt:70,tg:["Versatility","Long Shots"],age:33,foot:"Right",ht:"185cm",wt:"78kg",club:"Cardiff City",bio:"Curaçao's talisman at their first World Cup."},
{id:119,nm:"Hato",fn:"Juninho Bacuna",num:11,nt:"CUR",pos:"FW",v:5,ch:2.0,rt:68,tg:["Pace","Dribbling"],age:29,foot:"Right",ht:"176cm",wt:"71kg",club:"Birmingham City",bio:"Key attacker for the smallest WC nation ever."},
// Haiti
{id:120,nm:"Nazon",fn:"Duckens Nazon",num:9,nt:"HAI",pos:"FW",v:5,ch:4.5,rt:71,tg:["Finishing","Poaching"],age:30,foot:"Right",ht:"176cm",wt:"72kg",club:"Championnat National",bio:"Haiti's all-time World Cup qualifying top scorer."},
{id:121,nm:"Duverger",fn:"Steeven Duverger",num:1,nt:"HAI",pos:"GK",v:3,ch:0.5,rt:68,tg:["Reflexes","Command"],age:28,foot:"Right",ht:"188cm",wt:"82kg",club:"Guingamp",bio:"Haiti's safe pair of hands."},
// Japan
{id:122,nm:"Mitoma",fn:"Kaoru Mitoma",num:7,nt:"JPN",pos:"FW",v:58,ch:2.8,rt:84,tg:["Dribbling","Pace","Intelligence"],age:29,foot:"Left",ht:"178cm",wt:"72kg",club:"Brighton",bio:"Japan's dazzling dribbler."},
{id:123,nm:"Kamada",fn:"Daichi Kamada",num:8,nt:"JPN",pos:"MF",v:42,ch:1.5,rt:82,tg:["Creativity","Through Balls"],age:28,foot:"Right",ht:"180cm",wt:"76kg",club:"Crystal Palace",bio:"Japan's creative force in midfield."},
// Iran
{id:124,nm:"Taremi",fn:"Mehdi Taremi",num:9,nt:"IRN",pos:"FW",v:32,ch:0.8,rt:80,tg:["Finishing","Aerial","Hold-up"],age:32,foot:"Right",ht:"187cm",wt:"82kg",club:"Inter Milan",bio:"Iran's prolific all-time scorer."},
{id:125,nm:"Azmoun",fn:"Sardar Azmoun",num:20,nt:"IRN",pos:"FW",v:25,ch:-0.5,rt:79,tg:["Pace","Movement","Finishing"],age:31,foot:"Right",ht:"186cm",wt:"80kg",club:"Roma",bio:"The Iranian Messi."},
// Australia
{id:126,nm:"Arzani",fn:"Daniel Arzani",num:11,nt:"AUS",pos:"FW",v:15,ch:3.0,rt:75,tg:["Dribbling","Pace","Youth"],age:27,foot:"Left",ht:"170cm",wt:"62kg",club:"Macarthur FC",bio:"Australia's flashiest attacker."},
{id:127,nm:"Souttar",fn:"Harry Souttar",num:6,nt:"AUS",pos:"DF",v:22,ch:1.2,rt:77,tg:["Aerial","Tackling","Height"],age:26,foot:"Right",ht:"198cm",wt:"92kg",club:"Leicester City",bio:"Australia's giant centre-back."},
// Saudi Arabia
{id:128,nm:"Al-Dawsari",fn:"Salem Al-Dawsari",num:10,nt:"KSA",pos:"FW",v:15,ch:1.0,rt:76,tg:["Free Kicks","Finishing"],age:33,foot:"Left",ht:"172cm",wt:"67kg",club:"Al-Hilal",bio:"Saudi legend who scored THAT goal against Argentina."},
{id:129,nm:"Kanno",fn:"Mohamed Kanno",num:8,nt:"KSA",pos:"MF",v:12,ch:0.5,rt:74,tg:["Box-to-Box","Stamina"],age:30,foot:"Right",ht:"188cm",wt:"80kg",club:"Al-Hilal",bio:"Saudi Arabia's midfield powerhouse."},
// Qatar
{id:130,nm:"Afif",fn:"Akram Afif",num:11,nt:"QAT",pos:"FW",v:18,ch:1.2,rt:77,tg:["Dribbling","Creativity","Set Pieces"],age:27,foot:"Left",ht:"177cm",wt:"68kg",club:"Al Sadd",bio:"Asian Player of the Year 2024."},
{id:131,nm:"Haidos",fn:"Hassan Al-Haydos",num:10,nt:"QAT",pos:"MF",v:8,ch:-0.3,rt:73,tg:["Leadership","Vision"],age:34,foot:"Right",ht:"168cm",wt:"65kg",club:"Al Sadd",bio:"Qatar's all-time cap record holder."},
// Uzbekistan
{id:132,nm:"Shomurodov",fn:"Eldor Shomurodov",num:9,nt:"UZB",pos:"FW",v:18,ch:2.5,rt:76,tg:["Finishing","Pace"],age:29,foot:"Right",ht:"189cm",wt:"82kg",club:"Roma",bio:"Uzbekistan's first-ever World Cup star."},
{id:133,nm:"Khamrobekov",fn:"Abdukodir Khusanov",num:4,nt:"UZB",pos:"DF",v:25,ch:4.0,rt:78,tg:["Tackling","Aerial","Youth"],age:21,foot:"Right",ht:"186cm",wt:"82kg",club:"Manchester City",bio:"Breakout Uzbek defender signed by City."},
// Jordan
{id:134,nm:"Al-Tamari",fn:"Mousa Al-Tamari",num:7,nt:"JOR",pos:"FW",v:10,ch:2.0,rt:74,tg:["Dribbling","Pace"],age:28,foot:"Left",ht:"171cm",wt:"65kg",club:"Montpellier",bio:"Jordan's star at their first-ever World Cup."},
{id:135,nm:"Yasin",fn:"Yazan Al-Naimat",num:9,nt:"JOR",pos:"FW",v:6,ch:1.5,rt:71,tg:["Finishing","Movement"],age:25,foot:"Right",ht:"183cm",wt:"77kg",club:"Young Boys",bio:"Jordan's young striker."},
// Senegal
{id:136,nm:"Koulibaly",fn:"Kalidou Koulibaly",num:3,nt:"SEN",pos:"DF",v:28,ch:-0.5,rt:82,tg:["Tackling","Aerial","Leadership"],age:35,foot:"Right",ht:"186cm",wt:"89kg",club:"Al-Hilal",bio:"Senegal's defensive rock."},
{id:137,nm:"Diallo",fn:"Abdallah Sima",num:9,nt:"SEN",pos:"FW",v:35,ch:3.2,rt:80,tg:["Pace","Finishing","Direct"],age:25,foot:"Right",ht:"183cm",wt:"75kg",club:"Brighton",bio:"Senegal's explosive young forward."},
// Algeria
{id:138,nm:"Mahrez",fn:"Riyad Mahrez",num:7,nt:"ALG",pos:"FW",v:22,ch:-1.0,rt:80,tg:["Dribbling","Cutting Inside","Free Kicks"],age:35,foot:"Left",ht:"179cm",wt:"67kg",club:"Al-Ahli",bio:"Algeria's most talented player of his generation."},
{id:139,nm:"Bennacer",fn:"Ismaël Bennacer",num:8,nt:"ALG",pos:"MF",v:38,ch:0.8,rt:82,tg:["Passing","Press Resistance","Composure"],age:28,foot:"Left",ht:"175cm",wt:"70kg",club:"AC Milan",bio:"Algeria's metronome in midfield."},
// Tunisia
{id:140,nm:"Khazri",fn:"Wahbi Khazri",num:10,nt:"TUN",pos:"FW",v:10,ch:0.5,rt:74,tg:["Set Pieces","Creativity"],age:35,foot:"Right",ht:"183cm",wt:"80kg",club:"Montpellier",bio:"Tunisia's experienced talisman."},
{id:141,nm:"Skhiri",fn:"Ellyes Skhiri",num:8,nt:"TUN",pos:"MF",v:28,ch:1.2,rt:79,tg:["Box-to-Box","Tackling","Stamina"],age:30,foot:"Right",ht:"185cm",wt:"78kg",club:"PSG",bio:"Tunisia's midfield engine."},
// South Africa
{id:142,nm:"Tau",fn:"Percy Tau",num:11,nt:"RSA",pos:"FW",v:10,ch:1.5,rt:74,tg:["Pace","Dribbling"],age:32,foot:"Right",ht:"172cm",wt:"66kg",club:"Al Ahly",bio:"Bafana Bafana's trickiest attacker."},
{id:143,nm:"Mokoena",fn:"Teboho Mokoena",num:8,nt:"RSA",pos:"MF",v:12,ch:2.0,rt:75,tg:["Long Shots","Passing"],age:27,foot:"Right",ht:"179cm",wt:"72kg",club:"Mamelodi Sundowns",bio:"South Africa's rising midfield star."},
// Ivory Coast
{id:144,nm:"Kessié",fn:"Franck Kessié",num:8,nt:"CIV",pos:"MF",v:25,ch:0.5,rt:79,tg:["Power","Box-to-Box","Tackling"],age:29,foot:"Right",ht:"183cm",wt:"85kg",club:"Al-Ahli",bio:"Ivory Coast's midfield tank."},
{id:145,nm:"Haller",fn:"Sébastien Haller",num:9,nt:"CIV",pos:"FW",v:22,ch:1.8,rt:78,tg:["Aerial","Finishing","Hold-up"],age:32,foot:"Right",ht:"190cm",wt:"83kg",club:"Dortmund",bio:"Remarkable comeback story — cancer survivor turned AFCON champion."},
// Cape Verde
{id:146,nm:"G. Rodrigues",fn:"Garry Rodrigues",num:10,nt:"CPV",pos:"FW",v:8,ch:2.5,rt:72,tg:["Pace","Dribbling"],age:34,foot:"Right",ht:"180cm",wt:"72kg",club:"Olympiacos",bio:"Cape Verde's talisman at their maiden World Cup."},
{id:147,nm:"R. Lopes",fn:"Roberto Lopes",num:4,nt:"CPV",pos:"DF",v:5,ch:0.5,rt:70,tg:["Aerial","Leadership"],age:31,foot:"Right",ht:"188cm",wt:"82kg",club:"Shamrock Rovers",bio:"Irish-born Cape Verde hero."},
// Ecuador
{id:148,nm:"Caicedo",fn:"Moisés Caicedo",num:23,nt:"ECU",pos:"MF",v:85,ch:2.0,rt:86,tg:["Tackling","Box-to-Box","Carrying"],age:24,foot:"Right",ht:"178cm",wt:"74kg",club:"Chelsea",bio:"Ecuador's world-class midfield destroyer."},
{id:149,nm:"Sarmiento",fn:"Jeremy Sarmiento",num:11,nt:"ECU",pos:"FW",v:22,ch:1.5,rt:76,tg:["Dribbling","Pace","Youth"],age:22,foot:"Left",ht:"178cm",wt:"70kg",club:"Ipswich Town",bio:"Young Ecuadorian winger with flair."},
// Paraguay
{id:150,nm:"Almirón",fn:"Miguel Almirón",num:10,nt:"PAR",pos:"MF",v:22,ch:-0.5,rt:78,tg:["Pace","Dribbling","Work Rate"],age:32,foot:"Right",ht:"174cm",wt:"68kg",club:"Newcastle",bio:"Paraguay's hardest-working attacker."},
{id:151,nm:"Gómez",fn:"Julio Enciso",num:9,nt:"PAR",pos:"FW",v:25,ch:4.2,rt:78,tg:["Finishing","Youth","Flair"],age:21,foot:"Left",ht:"172cm",wt:"64kg",club:"Brighton",bio:"Paraguay's teenage sensation."},
// New Zealand
{id:152,nm:"Wood",fn:"Chris Wood",num:9,nt:"NZL",pos:"FW",v:18,ch:0.5,rt:77,tg:["Aerial","Finishing","Hold-up"],age:34,foot:"Right",ht:"191cm",wt:"82kg",club:"Nottingham Forest",bio:"New Zealand's all-time leading scorer."},
{id:153,nm:"Cacace",fn:"Liberato Cacace",num:3,nt:"NZL",pos:"DF",v:8,ch:1.0,rt:73,tg:["Overlapping","Pace"],age:25,foot:"Left",ht:"180cm",wt:"75kg",club:"Empoli",bio:"Young Kiwi defender in Serie A."},
];

const COL_XI=[{id:47,nm:"L. Díaz",num:7,pos:"FW",v:75,ch:-1.8,rt:85,nt:"COL",tg:["Dribbling"]},{id:70,nm:"Arias",num:11,pos:"FW",v:42,ch:1.2,rt:79,nt:"COL",tg:["Pace"]},{id:71,nm:"R. Ríos",num:14,pos:"MF",v:38,ch:2.5,rt:78,nt:"COL",tg:["Passing"]},{id:72,nm:"Lerma",num:6,pos:"MF",v:30,ch:0.5,rt:76,nt:"COL",tg:["Tackling"]},{id:73,nm:"James",num:10,pos:"MF",v:22,ch:-1.5,rt:80,nt:"COL",tg:["Vision"]},{id:74,nm:"D. Sánchez",num:23,pos:"DF",v:28,ch:0.3,rt:77,nt:"COL",tg:["Aerial"]},{id:75,nm:"Lucumí",num:4,pos:"DF",v:32,ch:1.0,rt:78,nt:"COL",tg:["Composure"]},{id:76,nm:"Mojica",num:17,pos:"DF",v:18,ch:0.2,rt:74,nt:"COL",tg:["Overlapping"]},{id:77,nm:"Muñoz",num:2,pos:"DF",v:25,ch:1.5,rt:76,nt:"COL",tg:["Energy"]},{id:78,nm:"Córdoba",num:9,pos:"FW",v:35,ch:2.0,rt:78,nt:"COL",tg:["Movement"]},{id:79,nm:"Vargas",num:1,pos:"GK",v:12,ch:0.1,rt:74,nt:"COL",tg:["Reflexes"]}];

const LIVE_MATCH={home:"FRA",away:"COL",hs:2,as:1,min:72,group:"D",status:"LIVE",homeXI:[7,8,9,10,11,51,60,61,62,63,{id:99,nm:"Griezmann",fn:"Antoine Griezmann",num:17,pos:"MF",v:55,ch:0.9,rt:84,nt:"FRA",tg:["Link-up"]}],awayXI:COL_XI,changes:{7:3.2,8:1.1,9:0.5,10:1.5,11:1.8,51:0.8,60:0.3,61:-0.2,62:0.6,63:0.4,99:0.9,47:-1.8,70:-0.5,71:0.3,72:-0.8,73:-1.2,74:-0.6,75:0.2,76:-0.3,77:0.1,78:0.6,79:-0.4},events:[{m:12,t:"⚽",p:"Mbappé",pid:7,tm:"FRA",n:"Left foot, far post"},{m:34,t:"⚽",p:"L. Díaz",pid:47,tm:"COL",n:"Counter-attack"},{m:41,t:"🟨",p:"Lerma",pid:72,tm:"COL",n:"Late challenge on Tchouaméni"},{m:58,t:"⚽",p:"Mbappé",pid:7,tm:"FRA",n:"Penalty conversion"},{m:65,t:"🟨",p:"Camavinga",pid:10,tm:"FRA",n:"Tactical foul"},{m:70,t:"🔄",p:"Barcola → Dembélé",pid:9,tm:"FRA",n:"Substitution"}],playerCurves:{7:[{m:0,pf:0},{m:12,pf:1.8},{m:30,pf:2.0},{m:45,pf:2.2},{m:58,pf:3.2},{m:72,pf:3.2}],47:[{m:0,pf:0},{m:20,pf:-0.3},{m:34,pf:1.5},{m:50,pf:1.0},{m:60,pf:-0.8},{m:72,pf:-1.8}],10:[{m:0,pf:0},{m:30,pf:0.5},{m:50,pf:1.0},{m:65,pf:0.2},{m:72,pf:1.5}],51:[{m:0,pf:0},{m:20,pf:0.3},{m:45,pf:0.5},{m:60,pf:0.7},{m:72,pf:0.8}]}};

const FT_MATCH={home:"NOR",away:"KOR",hs:3,as:2,min:90,group:"H",status:"FT",homeXI:[26,27,{id:80,nm:"Sørloth",num:11,pos:"FW",v:32,ch:4.5,rt:79,nt:"NOR",tg:["Aerial"]},{id:81,nm:"Berge",num:6,pos:"MF",v:28,ch:1.2,rt:78,nt:"NOR",tg:["Box-to-Box"]},{id:82,nm:"Ajer",num:3,pos:"DF",v:22,ch:0.8,rt:77,nt:"NOR",tg:["Ball Playing"]},{id:83,nm:"Nyland",num:1,pos:"GK",v:8,ch:0.2,rt:74,nt:"NOR",tg:["Reflexes"]},{id:84,nm:"Ryerson",num:2,pos:"DF",v:18,ch:1.5,rt:76,nt:"NOR",tg:["Overlapping"]},{id:85,nm:"Ostigard",num:5,pos:"DF",v:15,ch:-0.5,rt:75,nt:"NOR",tg:["Aerial"]},{id:86,nm:"Myhre J.",num:15,pos:"DF",v:10,ch:0.3,rt:73,nt:"NOR",tg:["Defensive"]},{id:87,nm:"Thorsby",num:14,pos:"MF",v:12,ch:0.5,rt:74,nt:"NOR",tg:["Pressing"]},{id:88,nm:"Hauge",num:17,pos:"FW",v:15,ch:2.0,rt:75,nt:"NOR",tg:["Dribbling"]}],awayXI:[36,37,{id:89,nm:"Hwang H.",num:11,pos:"FW",v:35,ch:-1.0,rt:80,nt:"KOR",tg:["Pace"]},{id:90,nm:"Lee K.",num:10,pos:"MF",v:45,ch:1.5,rt:82,nt:"KOR",tg:["Creativity"]},{id:91,nm:"Hwang I.",num:8,pos:"MF",v:22,ch:0.8,rt:77,nt:"KOR",tg:["Box-to-Box"]},{id:92,nm:"Jung W.",num:6,pos:"MF",v:18,ch:-0.3,rt:75,nt:"KOR",tg:["Tackling"]},{id:93,nm:"Kim J.",num:22,pos:"DF",v:15,ch:0.5,rt:74,nt:"KOR",tg:["Pace"]},{id:94,nm:"Cho Y.",num:16,pos:"DF",v:12,ch:-0.8,rt:73,nt:"KOR",tg:["Positioning"]},{id:95,nm:"Hong C.",num:5,pos:"DF",v:14,ch:-1.2,rt:74,nt:"KOR",tg:["Aerial"]},{id:96,nm:"Kim S.",num:1,pos:"GK",v:10,ch:-0.5,rt:75,nt:"KOR",tg:["Reflexes"]},{id:97,nm:"Lee J.",num:19,pos:"DF",v:12,ch:0.3,rt:73,nt:"KOR",tg:["Tackling"]}],changes:{26:5.8,27:2.5,80:4.5,36:-1.5,37:-0.8,89:-1.0,90:1.5},events:[{m:8,t:"⚽",p:"Haaland",pid:26,tm:"NOR",n:"Header from Ødegaard cross"},{m:23,t:"⚽",p:"Son",pid:36,tm:"KOR",n:"Cut inside, curled far corner"},{m:31,t:"🟨",p:"Jung W.",pid:92,tm:"KOR",n:"Foul on Ødegaard"},{m:38,t:"⚽",p:"Haaland",pid:26,tm:"NOR",n:"Tap-in after Sørloth flick"},{m:52,t:"⚽",p:"Sørloth",pid:80,tm:"NOR",n:"Powerful strike from edge"},{m:67,t:"⚽",p:"Hwang H.",pid:89,tm:"KOR",n:"Quick counter"},{m:85,t:"🟨",p:"Kim Min-jae",pid:37,tm:"KOR",n:"Time wasting"}],playerCurves:{26:[{m:0,pf:0},{m:8,pf:2.8},{m:38,pf:5.2},{m:90,pf:5.8}],36:[{m:0,pf:0},{m:23,pf:2.0},{m:45,pf:1.8},{m:90,pf:-1.5}]}};

const MM={"FRA_COL":LIVE_MATCH,"NOR_KOR":FT_MATCH};
const FIX=[{id:1,h:"MEX",a:"IRN",dt:"Jun 11",s:"UP",g:"A",nt:"Opening · Azteca"},{id:5,h:"FRA",a:"COL",hs:2,as:1,s:"LV",min:72,g:"D"},{id:6,h:"NOR",a:"KOR",hs:3,as:2,dt:"Jun 14",s:"FT",g:"H"},{id:3,h:"USA",a:"ENG",dt:"Jun 14",s:"UP",g:"B"},{id:4,h:"ESP",a:"JPN",dt:"Jun 15",s:"UP",g:"E"},{id:7,h:"CIV",a:"CRO",hs:1,as:1,dt:"Jun 13",s:"FT",g:"G"},{id:8,h:"BRA",a:"CIV",dt:"Jun 17",s:"UP",g:"G"},{id:9,h:"GER",a:"JPN",dt:"Jun 16",s:"UP",g:"F"},{id:2,h:"ARG",a:"MAR",dt:"Jun 12",s:"UP",g:"A"}];
const LB=[{rk:1,nm:"ElGauchito",val:14250,pnl:4250,ret:42.5,av:"🏆"},{rk:2,nm:"SambaCapital",val:13100,pnl:3100,ret:31.0,av:"⚡"},{rk:3,nm:"You",val:12400,pnl:2400,ret:24.0,av:"🎯",me:true},{rk:4,nm:"FuryInvestor",val:11800,pnl:1800,ret:18.0,av:"🦁"},{rk:5,nm:"TotalFootball",val:11200,pnl:1200,ret:12.0,av:"📊"},{rk:6,nm:"PressingHigh",val:10600,pnl:600,ret:6.0,av:"🧠"},{rk:7,nm:"TikiTaka",val:10100,pnl:100,ret:1.0,av:"🔄"},{rk:8,nm:"Counter",val:9700,pnl:-300,ret:-3.0,av:"🏃"}];
const MYPORT=[{pid:7,sh:50,ab:172},{pid:26,sh:40,ab:168},{pid:16,sh:80,ab:125},{pid:12,sh:45,ab:148},{pid:4,sh:60,ab:152},{pid:18,sh:55,ab:118},{pid:51,sh:70,ab:72},{pid:32,sh:90,ab:62},{pid:39,sh:100,ab:48},{pid:6,sh:120,ab:52},{pid:31,sh:65,ab:68},{pid:53,sh:80,ab:40}];
const Pcl={FW:"rgba(255,255,255,.45)",MF:"rgba(255,255,255,.45)",DF:"rgba(255,255,255,.45)",GK:"rgba(255,255,255,.45)"};
const Pla={FW:"Forward",MF:"Midfield",DF:"Defence",GK:"Goalkeeper"};
const genSpark=(ch,id,len=20)=>{const s=id*7+13;return Array.from({length:len},(_,i)=>50+(ch/100)*i*30+Math.sin(i*s*0.3)*4+Math.sin(i*0.7+s)*3);};
const toggleSet=(set,setFn,val)=>{const s=new Set(set);if(s.has(val))s.delete(val);else s.add(val);setFn(s);};
const priceLabel=v=>v>=999?"∞":"€"+v+"M";

const CSS=`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{display:none}@keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes glow{0%,100%{opacity:.35}50%{opacity:.7}}.mono{font-family:'JetBrains Mono',monospace}.bg{background:rgba(255,255,255,.04);color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.06);padding:8px 14px;border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit;min-height:36px;display:inline-flex;align-items:center}.bg.on{background:rgba(55,255,99,.08);color:#37ff63;border-color:rgba(55,255,99,.15)}.ch{display:inline-flex;align-items:center;padding:4px 10px;border-radius:7px;font-size:12px;font-weight:700}.cu{background:rgba(55,255,99,.1);color:#37ff63}.cn{background:rgba(255,40,93,.1);color:#ff285d}`;

/* ── Micro ── */
const Spark=({data,color,w=60,h=20})=>{const mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||1;const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-mn)/r)*h}`).join(" ");const gid="s"+Math.random().toString(36).slice(2,6);return (<svg width={w} height={h} style={{display:"block"}}><defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs><polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gid})`}/><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);};
const PB=({p})=>(<span style={{display:"inline-flex",padding:"3px 9px",borderRadius:6,fontSize:12,fontWeight:700,background:Pcl[p]+"20",color:Pcl[p]}}>{Pla[p]}</span>);
const Live=()=>(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.1)",padding:"7px 12px",borderRadius:10,fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)"}}><span style={{width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,.5)",animation:"pulse 1.5s infinite"}}/>LIVE</span>);

/* ── Sheet ── */
function Sheet({open,onClose,children,footer}){
  if(!open) return null;
  return (<div style={{position:"fixed",inset:0,zIndex:200}} onClick={onClose}><div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)",backdropFilter:"blur(6px)"}}/><div onClick={e=>e.stopPropagation()} style={{position:"absolute",bottom:0,left:0,right:0,background:"#020406",borderRadius:"18px 18px 0 0",maxHeight:"95vh",display:"flex",flexDirection:"column",animation:"slideUp .3s ease",border:"1px solid rgba(255,255,255,.06)",borderBottom:"none"}}>
    <div style={{padding:"8px 0 2px",display:"flex",justifyContent:"center",flexShrink:0}}><div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,.15)"}}/></div>
    <div style={{flex:1,overflowY:"auto",minHeight:0}}>{children}</div>
    {footer&&<div style={{flexShrink:0,padding:"10px 20px",paddingBottom:"max(12px,env(safe-area-inset-bottom))",borderTop:"1px solid rgba(255,255,255,.06)",background:"#020406"}}>{footer}</div>}
  </div></div>);
}

/* ═══════ PLAYER DETAIL SHEET ═══════ */
/* ═══ Reusable Trade Workflow — slider %, Long/Short detection, confirmation ═══ */
function TradeFlow({player,onDone,goPortfolio}){
  const[trade,setTrade]=useState(null);
  const[pct,setPct]=useState(10);
  const[confirmed,setConfirmed]=useState(null);
  const[mode,setMode]=useState("pct");
  const[customShares,setCustomShares]=useState(0);
  const chg=player.ch||0;
  const isUp=chg>=0;

  // Real portfolio value from MYPORT
  const portfolioVal=useMemo(()=>MYPORT.reduce((a,h)=>{const p=P.find(x=>x.id===h.pid);return a+(p?p.v*h.sh:0);},0),[]);
  // Real held shares for this player
  const holding=MYPORT.find(h=>h.pid===player.id);
  const heldShares=holding?holding.sh:0;
  const heldValue=heldShares*player.v;
  const heldAvg=holding?holding.ab:0;
  const heldPnl=holding?(player.v-holding.ab)*holding.sh:0;

  const effectiveAmount=Math.round(portfolioVal*pct/100);
  const sharesFromAmount=Math.floor(effectiveAmount/player.v*10)/10;

  if(confirmed){
    const isBuy=confirmed.type==="buy";
    return (
      <div style={{textAlign:"center",padding:"8px 0"}}>
        <div style={{fontSize:36,marginBottom:4}}>{isBuy?"✅":"🔴"}</div>
        <div style={{fontSize:15,fontWeight:800,color:isBuy?"#37ff63":"#ff285d",marginBottom:2}}>{isBuy?"Bought":"Sold"}!</div>
        <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>{confirmed.pct}% of {player.nm}</div>
        <div style={{display:"flex",justifyContent:"center",gap:14,marginBottom:10}}>
          <div><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Shares</div><div className="mono" style={{fontSize:13,fontWeight:800}}>{confirmed.shares}</div></div>
          <div style={{width:1,background:"rgba(255,255,255,.06)"}}/>
          <div><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Amount</div><div className="mono" style={{fontSize:13,fontWeight:800}}>€{confirmed.amount.toLocaleString()}</div></div>
          <div style={{width:1,background:"rgba(255,255,255,.06)"}}/>
          <div><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Position</div><div style={{fontSize:11,fontWeight:700,color:isBuy?"#37ff63":"#ff285d"}}>{isBuy?"📈 Long":"📉 Short"}</div></div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>{setConfirmed(null);setTrade(null);onDone&&onDone();}} style={{flex:2,padding:"10px 0",fontSize:11,fontWeight:800,borderRadius:8,background:"rgba(255,255,255,.08)",color:"#fff",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Done ✓</button>
          <button onClick={()=>{setConfirmed(null);setTrade(null);goPortfolio&&goPortfolio();}} style={{flex:1,padding:"10px 0",fontSize:11,fontWeight:600,borderRadius:8,background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.4)",border:"1px solid rgba(255,255,255,.08)",cursor:"pointer",fontFamily:"inherit"}}>Portfolio →</button>
        </div>
      </div>
    );
  }

  if(trade){
    const isBuy=trade==="buy";
    // Compute from active mode
    const finalShares=mode==="pct"?sharesFromAmount:customShares;
    const finalAmount=mode==="pct"?effectiveAmount:Math.round(customShares*player.v);
    const finalPct=mode==="pct"?pct:Math.round((finalAmount/portfolioVal)*100);
    const isShort=!isBuy&&finalShares>heldShares;
    const shortQty=isShort?Math.round((finalShares-heldShares)*10)/10:0;
    return (
      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:13,fontWeight:800,color:isBuy?"#37ff63":"#ff285d"}}>{isBuy?"Buy":"Sell"}</span><span style={{fontSize:13,fontWeight:800}}>{player.nm}</span></div>
          <div onClick={()=>setTrade(null)} style={{width:28,height:28,borderRadius:5,background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"rgba(255,255,255,.35)",cursor:"pointer"}}>✕</div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",marginBottom:4,borderBottom:"1px solid rgba(255,255,255,.04)"}}>
          <div><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Price/Share</div><div className="mono" style={{fontSize:12,fontWeight:800}}>€{player.v}M</div></div>
          <div style={{textAlign:"center"}}><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>24h</div><div className="mono" style={{fontSize:11,fontWeight:700,color:isUp?"#37ff63":"#ff285d"}}>{isUp?"+":""}{chg}%</div></div>
          {isBuy
            ?<div style={{textAlign:"right"}}><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Available</div><div className="mono" style={{fontSize:11,fontWeight:700}}>€{(portfolioVal/1000).toFixed(1)}k</div></div>
            :<div style={{textAlign:"right"}}><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>You Hold</div><div className="mono" style={{fontSize:11,fontWeight:700}}>{heldShares} shares</div></div>
          }
        </div>


        {/* Mode toggle */}
        <div style={{display:"flex",background:"rgba(255,255,255,.03)",borderRadius:8,padding:2,marginBottom:8}}>
          {[{k:"pct",l:"% Portfolio"},{k:"shares",l:"Shares"}].map(m=>(
            <button key={m.k} onClick={()=>setMode(m.k)} style={{flex:1,padding:"8px 0",borderRadius:7,fontSize:12,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit",background:mode===m.k?"rgba(255,255,255,.08)":"transparent",color:mode===m.k?"#fff":"rgba(255,255,255,.15)"}}>{m.l}</button>
          ))}
        </div>

        {/* Big value — top, always visible */}
        <div style={{textAlign:"center",marginBottom:4}}>
          <div className="mono" style={{fontSize:28,fontWeight:800,lineHeight:1}}>
            {mode==="pct"?<>{pct}<span style={{fontSize:16,color:"rgba(255,255,255,.25)"}}>%</span></>:<>{customShares} <span style={{fontSize:14,fontWeight:500,color:"rgba(255,255,255,.25)"}}>shares</span></>}
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.25)",marginTop:3}}>
            {mode==="pct"?"€"+effectiveAmount.toLocaleString()+" · "+sharesFromAmount+" shares":"€"+Math.round(customShares*player.v).toLocaleString()+" total"}
          </div>
        </div>

        {/* Shortcuts */}
        <div style={{display:"flex",justifyContent:"center",gap:4,marginBottom:8}}>
          {mode==="pct"
            ?[10,25,50,75,100].map(v=>(<span key={v} style={{fontSize:12,color:pct===v?"#fff":"rgba(255,255,255,.15)",fontWeight:pct===v?700:400,cursor:"pointer",padding:"5px 10px",borderRadius:6,background:pct===v?"rgba(255,255,255,.06)":"rgba(255,255,255,.03)"}} onClick={()=>setPct(v)}>{v}%</span>))
            :(()=>{const maxS=isBuy?Math.floor(portfolioVal/player.v):Math.max(heldShares,Math.floor(portfolioVal/player.v));const vals=!isBuy&&heldShares>0?[Math.round(heldShares*.25),Math.round(heldShares*.5),Math.round(heldShares*.75),heldShares]:[Math.round(maxS*.1),Math.round(maxS*.25),Math.round(maxS*.5),maxS];return vals.map(v=>(<span key={v} style={{fontSize:12,color:customShares===v?"#fff":"rgba(255,255,255,.15)",fontWeight:customShares===v?700:400,cursor:"pointer",padding:"5px 10px",borderRadius:6,background:customShares===v?"rgba(255,255,255,.06)":"rgba(255,255,255,.03)"}} onClick={()=>setCustomShares(v)}>{v}</span>));})()
          }
          {mode==="shares"&&!isBuy&&heldShares>0&&<span style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.4)",cursor:"pointer",padding:"5px 10px",borderRadius:6,background:"rgba(55,255,99,.1)"}} onClick={()=>setCustomShares(heldShares)}>Max</span>}
        </div>

        {/* Slider */}
        {mode==="pct"?(
          <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",borderRadius:10,padding:"12px 12px 8px",marginBottom:10}}>
            <input type="range" min={1} max={100} step={1} value={pct} onChange={e=>setPct(parseInt(e.target.value))} style={{width:"100%"}}/>
          </div>
        ):(()=>{
          const maxShares=isBuy?Math.floor(portfolioVal/player.v):Math.max(heldShares,Math.floor(portfolioVal/player.v));
          const sliderMax=Math.max(maxShares,1);
          return (
          <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",borderRadius:10,padding:"12px 12px 8px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>setCustomShares(Math.max(0,customShares-1))} style={{width:36,height:36,borderRadius:9,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.08)",color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit",flexShrink:0}}>−</button>
              <input type="range" min={0} max={sliderMax} step={1} value={customShares} onChange={e=>setCustomShares(parseInt(e.target.value))} style={{flex:1}}/>
              <button onClick={()=>setCustomShares(Math.min(sliderMax,customShares+1))} style={{width:36,height:36,borderRadius:9,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.08)",color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit",flexShrink:0}}>+</button>
            </div>
          </div>
          );})()
        )}

        {/* Summary — below slider, visible after releasing thumb */}
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Shares</span><span className="mono" style={{fontSize:12,fontWeight:700}}>{finalShares} @ €{player.v}M</span></div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Total</span><span className="mono" style={{fontSize:14,fontWeight:800,color:isBuy?"#37ff63":"#ff285d"}}>€{finalAmount.toLocaleString()}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Position</span><span style={{fontSize:12,fontWeight:600,color:isBuy?"#37ff63":isShort?"rgba(255,255,255,.45)":"#ff285d"}}>{isBuy?"📈 Long":isShort?"📉 Short ("+shortQty+" naked)":"Close Position"}</span></div>
        {isShort&&(
          <div style={{background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.15)",borderRadius:8,padding:"6px 10px",marginBottom:6,display:"flex",alignItems:"flex-start",gap:6}}>
            <span style={{fontSize:12,flexShrink:0}}>⚠️</span>
            <span style={{fontSize:12,color:"rgba(255,255,255,.45)",lineHeight:1.4}}>Selling {finalShares} closes your {heldShares} shares and opens a short of {shortQty}.</span>
          </div>
        )}

        {/* Buttons — Cancel + Confirm */}
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setTrade(null)} style={{flex:1,padding:"12px 0",fontSize:13,fontWeight:700,borderRadius:10,background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.35)",border:"1px solid rgba(255,255,255,.06)",cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={()=>{setConfirmed({type:trade,pct:finalPct,amount:finalAmount,shares:finalShares});setTrade(null);}} style={{flex:2,padding:"12px 0",fontSize:13,fontWeight:800,borderRadius:10,background:isBuy?"linear-gradient(135deg,#22c55e,#16a34a)":"linear-gradient(135deg,#ff285d,#dc2626)",color:"#fff",border:"none",cursor:"pointer",fontFamily:"inherit",boxShadow:isBuy?"0 4px 16px rgba(34,197,94,.25)":"0 4px 16px rgba(255,40,93,.25)"}}>Confirm {isBuy?"Buy":"Sell"}</button>
        </div>
      </div>
    );
  }

  // Default: show holding info + Buy/Sell/Close
  return (
    <div>
      {heldShares>0&&(
        <div style={{background:"rgba(55,255,99,.06)",border:"1px solid rgba(55,255,99,.12)",borderRadius:10,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,fontWeight:700,color:"#37ff63",background:"rgba(55,255,99,.12)",padding:"4px 9px",borderRadius:4}}>{Math.round((heldValue/portfolioVal)*100)}%</span>
            <div>
              <div className="mono" style={{fontSize:12,fontWeight:800}}>{heldShares} shares</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>avg €{heldAvg}M · value €{(heldValue/1000).toFixed(1)}k</div>
            </div>
          </div>
          <div className="mono" style={{fontSize:12,fontWeight:700,color:heldPnl>=0?"#37ff63":"#ff285d"}}>{heldPnl>=0?"+":""}€{(heldPnl/1000).toFixed(1)}k</div>
        </div>
      )}
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setTrade("buy")} style={{flex:1,padding:"14px 0",fontSize:15,fontWeight:700,borderRadius:12,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",border:"none",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(34,197,94,.2)"}}>Buy</button>
        <button onClick={()=>setTrade("sell")} style={{flex:1,padding:"14px 0",fontSize:15,fontWeight:700,borderRadius:12,background:"rgba(255,40,93,.1)",color:"#ff285d",border:"1px solid rgba(255,255,255,.12)",cursor:"pointer",fontFamily:"inherit"}}>Sell</button>
        {heldShares>0&&<button onClick={()=>{setConfirmed({type:"sell",pct:100,amount:heldValue,shares:heldShares});}} style={{padding:"14px 16px",fontSize:13,fontWeight:700,borderRadius:12,background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.4)",border:"1px solid rgba(255,255,255,.06)",cursor:"pointer",fontFamily:"inherit"}}>Close</button>}
      </div>
    </div>
  );
}

function PlayerSheet({player,onClose,goPortfolio,watchlist,toggleWatch}){
  const n=N[player.nt]||{n:"?",f:"🏳️",cl:"#888",c:"?",g:"?"};
  const[period,setPeriod]=useState("30d");
  const[selEvent,setSelEvent]=useState(null);
  const isWatched=watchlist?.has(player.id);
  const allEvents=useMemo(()=>{const b=player.v*0.82;return [{i:0,day:1,type:"news",icon:"📰",label:"Transfer rumours intensify",pct:2.1,price:Math.round(b*1.02)},{i:1,day:5,type:"news",icon:"🏥",label:"Passed fitness test — fully fit",pct:1.5,price:Math.round(b*1.035)},{i:2,day:8,type:"game",icon:"⚽",label:"Goal vs Morocco (Group A, 23')",pct:4.2,price:Math.round(b*1.08)},{i:3,day:10,type:"game",icon:"🅰️",label:"Assist vs Morocco (67')",pct:1.8,price:Math.round(b*1.10)},{i:4,day:12,type:"news",icon:"📊",label:"Named in Team of the Week",pct:0.8,price:Math.round(b*1.11)},{i:5,day:15,type:"game",icon:"🟨",label:"Yellow card vs Mexico (55')",pct:-1.2,price:Math.round(b*1.09)},{i:6,day:16,type:"game",icon:"⚽⚽",label:"Brace vs Mexico (71', 84')",pct:6.5,price:Math.round(b*1.16)},{i:7,day:19,type:"news",icon:"🗞️",label:"Manager praises in presser",pct:0.5,price:Math.round(b*1.17)},{i:8,day:22,type:"game",icon:"📉",label:"Poor rating vs Iran (5.8)",pct:-3.1,price:Math.round(b*1.13)},{i:9,day:24,type:"news",icon:"💬",label:"Motivated for R16",pct:0.9,price:Math.round(b*1.14)},{i:10,day:26,type:"game",icon:"⚽",label:"Goal vs Colombia (R16, 12')",pct:3.2,price:Math.round(b*1.18)},{i:11,day:27,type:"game",icon:"🌟",label:"MOTM — 9.2 rating",pct:2.8,price:Math.round(b*1.21)},{i:12,day:29,type:"news",icon:"🔥",label:"Trending — hype surge",pct:1.4,price:Math.round(player.v)}];},[player.id,player.v]);
  const pR={"inception":[0,30],"30d":[0,30],"7d":[23,30],"24h":[28,30],"live":[25,30]};
  const[lo,hi]=pR[period]||[0,30];
  const vis=allEvents.filter(e=>e.day>=lo&&e.day<=hi);
  const chartPts=useMemo(()=>{const len=period==="inception"?90:period==="30d"?60:period==="7d"?28:period==="24h"?48:36;const base=allEvents[0]?.price||player.v*0.82;return Array.from({length:len},(_,i)=>{const d=lo+(i/(len-1))*(hi-lo);let p=base;for(const e of allEvents){if(e.day<=d)p=e.price;}return p+Math.sin(i*(player.id||1)*0.4)*player.v*0.008;});},[period,allEvents,lo,hi,player.id,player.v]);
  const pRet=chartPts.length>1?((chartPts[chartPts.length-1]-chartPts[0])/chartPts[0]*100):0;
  const pIsUp=chartPts.length>1&&chartPts[chartPts.length-1]>=chartPts[0];
  const pCol=pIsUp?"#48ff43":"#ff285d";

  return (
    <Sheet open={true} onClose={onClose} footer={<TradeFlow player={player} goPortfolio={()=>{onClose();goPortfolio&&goPortfolio();}}/>}>
      {/* Hero — compact */}
      <div style={{padding:"0 20px 8px",background:`linear-gradient(180deg,${n.cl}18,transparent)`}}>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <div style={{width:44,height:44,borderRadius:11,flexShrink:0,background:`linear-gradient(135deg,${n.cl}55,${n.cl}22)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:`2px solid ${n.cl}44`}}>{n.f}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:800,lineHeight:1.1,letterSpacing:-.5}}>{player.fn||player.nm}</div>
            <div style={{display:"flex",alignItems:"center",gap:5,marginTop:3}}><PB p={player.pos}/><span style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>{n.n} · {player.club}</span></div>
          </div>
          <div onClick={()=>toggleWatch&&toggleWatch(player.id)} style={{width:36,height:36,borderRadius:9,background:isWatched?"rgba(255,255,255,.06)":"rgba(255,255,255,.04)",border:isWatched?"1px solid rgba(255,255,255,.1)":"1px solid rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,cursor:"pointer",flexShrink:0}}>{isWatched?"★":"☆"}</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,padding:"0 20px",marginBottom:10}}>
        {[{l:"Value",v:"€"+player.v+"M"},{l:"24h",v:(player.ch>=0?"+":"")+player.ch+"%",c:player.ch>=0?"#37ff63":"#ff285d"},{l:"Rating",v:player.rt,c:"rgba(255,255,255,.5)"},{l:"Age",v:player.age}].map((s,i)=>(
          <div key={i} style={{background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.04)",borderRadius:8,padding:"6px 4px",textAlign:"center"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,.25)"}}>{s.l}</div>
            <div className="mono" style={{fontSize:14,fontWeight:800,color:s.c||"#fff",marginTop:1}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{padding:"0 20px 8px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:16,fontWeight:800}}>Valuation</span>
          <span className="mono" style={{fontSize:15,fontWeight:800,color:pCol}}>{pRet>=0?"+":""}{pRet.toFixed(1)}%</span>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {["inception","30d","7d","24h","live"].map(p=>(
            <button key={p} onClick={()=>{setPeriod(p);setSelEvent(null);}} style={{padding:"8px 14px",borderRadius:8,fontSize:12,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"inherit",background:period===p?"rgba(255,255,255,.07)":"rgba(255,255,255,.03)",color:period===p?"#fff":"rgba(255,255,255,.25)"}}>{p==="inception"?"All":p==="live"?"Game":p.toUpperCase()}</button>
          ))}
        </div>
        <div style={{position:"relative"}}>
          {(()=>{const w=350,h=140,pd=8;
            if(chartPts.length<2)return null;
            const mn=Math.min(...chartPts),mx=Math.max(...chartPts),rng=mx-mn||1;
            const pts=chartPts.map((v,i)=>({x:pd+(i/(chartPts.length-1))*(w-pd*2),y:pd+((mx-v)/rng)*(h-pd*2)}));
            const ln=pts.map(p=>`${p.x},${p.y}`).join(" ");const last=pts[pts.length-1];
            const evPts=vis.map(e=>{const frac=(e.day-lo)/(hi-lo);const idx=Math.round(frac*(chartPts.length-1));const pt=pts[Math.min(idx,pts.length-1)];return {...e,cx:pt.x,cy:pt.y};});
            return (<svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
              <defs><linearGradient id="plg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={pCol} stopOpacity=".3"/><stop offset="100%" stopColor={pCol} stopOpacity="0"/></linearGradient></defs>
              {[0,.5,1].map((p,i)=>(<line key={i} x1={pd} x2={w-pd} y1={pd+p*(h-pd*2)} y2={pd+p*(h-pd*2)} stroke="rgba(255,255,255,.03)"/>))}
              <polygon points={`${pts[0].x},${h-pd} ${ln} ${last.x},${h-pd}`} fill="url(#plg)"/>
              <polyline points={ln} fill="none" stroke={pCol} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".1"/>
              <polyline points={ln} fill="none" stroke={pCol} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx={last.x} cy={last.y} r="4" fill={pCol}/><circle cx={last.x} cy={last.y} r="9" fill={pCol} opacity=".15"/>
              {selEvent&&(()=>{const se=evPts.find(e=>e.i===selEvent.i);return se?<line x1={se.cx} y1={pd} x2={se.cx} y2={h-pd} stroke="rgba(255,255,255,.12)" strokeWidth="1" strokeDasharray="3,2"/>:null;})()}
              {evPts.map((e,i)=>{const isSel=selEvent?.i===e.i;return (<g key={i} onClick={()=>setSelEvent(isSel?null:e)} style={{cursor:"pointer"}}><circle cx={e.cx} cy={e.cy} r="12" fill="transparent"/><circle cx={e.cx} cy={e.cy} r={isSel?7:5} fill={e.pct>=0?"#48ff43":"#ff285d"} stroke={isSel?"#fff":"#040810"} strokeWidth={isSel?2.5:2} style={{transition:"all .15s"}}/>{isSel&&<text x={e.cx} y={e.cy-12} textAnchor="middle" fill={e.pct>=0?"#48ff43":"#ff285d"} fontSize="8" fontFamily="'JetBrains Mono',monospace" fontWeight="700">{e.pct>=0?"+":""}{e.pct}%</text>}</g>);})}
            </svg>);})()}
          {/* Tooltip card for selected event */}
          {selEvent&&(
            <div style={{marginTop:8,background:"rgba(255,255,255,.03)",border:`1px solid ${selEvent.pct>=0?"rgba(55,255,99,.15)":"rgba(255,255,255,.12)"}`,borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"flex-start",gap:10,animation:"fu .12s ease"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:32}}>
                <span style={{fontSize:20}}>{selEvent.icon}</span>
                <span className="mono" style={{fontSize:11,color:"rgba(255,255,255,.15)",fontWeight:700}}>D{selEvent.day}</span>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:3}}>{selEvent.label}</div>
                <span style={{fontSize:11,color:"rgba(255,255,255,.25)",background:"rgba(255,255,255,.04)",padding:"3px 8px",borderRadius:4}}>{selEvent.type==="game"?"Match Event":"News / Off-pitch"}</span>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div className="mono" style={{fontSize:14,fontWeight:800}}>€{selEvent.price}M</div>
                <div className="mono" style={{fontSize:13,fontWeight:700,color:selEvent.pct>=0?"#37ff63":"#ff285d"}}>{selEvent.pct>=0?"+":""}{selEvent.pct}%</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* About — bio + tags + physical details */}
      <div style={{padding:"0 20px 12px"}}>
        <div style={{fontSize:15,fontWeight:800,marginBottom:8}}>About</div>
        <p style={{fontSize:13,color:"#7a7f92",lineHeight:1.6,marginBottom:10}}>{player.bio}</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{(player.tg||[]).map(t=>(<span key={t} style={{padding:"5px 12px",borderRadius:7,fontSize:12,fontWeight:600,background:"rgba(55,255,99,.08)",color:"rgba(255,255,255,.5)",border:"1px solid rgba(55,255,99,.1)"}}>{t}</span>))}</div>
        <div style={{display:"flex",gap:6}}>
          {[{l:"Foot",v:player.foot||"—"},{l:"Height",v:player.ht||"—"},{l:"Weight",v:player.wt||"—"}].map((s,i)=>(
            <div key={i} style={{flex:1,background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:8,padding:"8px",textAlign:"center"}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,.25)"}}>{s.l}</div>
              <div style={{fontSize:13,fontWeight:700,marginTop:2}}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Price Events — synced with chart */}
      <div style={{padding:"0 20px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,.05)"}}>
          <span style={{fontSize:15,fontWeight:800}}>Price Events</span>
          <span style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>{vis.length} events</span>
        </div>
        {vis.slice().reverse().map((e)=>{const isSel=selEvent?.i===e.i;return (
          <div key={e.i} onClick={()=>setSelEvent(isSel?null:e)} style={{display:"flex",alignItems:"flex-start",gap:10,padding:isSel?"12px 10px":"12px 0",borderBottom:"1px solid rgba(255,255,255,.04)",cursor:"pointer",background:isSel?"rgba(55,255,99,.06)":"transparent",borderRadius:isSel?10:0,margin:isSel?"0 -6px":"0",transition:"all .15s"}}>
            <span className="mono" style={{fontSize:12,color:"rgba(255,255,255,.15)",fontWeight:700,minWidth:26,paddingTop:2}}>D{e.day}</span>
            <span style={{fontSize:18,minWidth:24}}>{e.icon}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,lineHeight:1.4}}>{e.label}</div>
              <span style={{fontSize:11,color:"rgba(255,255,255,.25)",background:"rgba(255,255,255,.04)",padding:"3px 8px",borderRadius:4,marginTop:3,display:"inline-block"}}>{e.type==="game"?"Match":"News"}</span>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div className="mono" style={{fontSize:13,fontWeight:700}}>€{e.price}M</div>
              <div className="mono" style={{fontSize:13,fontWeight:700,color:e.pct>=0?"#37ff63":"#ff285d"}}>{e.pct>=0?"+":""}{e.pct}%</div>
            </div>
          </div>
        );})}
      </div>
    </Sheet>
  );
}

/* ═══════ MATCH VIEW ═══════ */
/* ═══════ MATCH VIEW — 3D pitch + overlay panel ═══════ */

/* ═══════ MATCH VIEW — SVG Perspective Pitch + Bottom Sheet ═══════ */

const FRA="#002395",COL="#FCD116";

const changes={7:3.2,8:1.1,9:0.5,10:1.5,11:1.8,51:0.8,60:0.3,61:-0.2,62:0.6,63:0.4,99:0.9,47:-1.8,70:-0.5,71:0.3,72:-0.8,73:-1.2,74:-0.6,75:0.2,76:-0.3,77:0.1,78:0.6,79:-0.4};

const FULL = {
  GK:{x:50,y:90},
  LB:{x:12,y:56},LCB:{x:33,y:58},RCB:{x:67,y:58},RB:{x:88,y:56},
  CB:{x:50,y:58},
  LWB:{x:10,y:48},RWB:{x:90,y:48},
  CDM:{x:50,y:39},LCDM:{x:33,y:39},RCDM:{x:67,y:39},
  LM:{x:10,y:28},LCM:{x:33,y:30},CM:{x:50,y:30},RCM:{x:67,y:30},RM:{x:90,y:28},
  LAM:{x:28,y:18},CAM:{x:50,y:18},RAM:{x:72,y:18},
  LW:{x:14,y:9},LST:{x:38,y:7},ST:{x:50,y:5},RST:{x:62,y:7},RW:{x:86,y:9},
  CF:{x:50,y:7},
};

const FORMATIONS={"4-4-2":["GK","LB","LCB","RCB","RB","LM","LCM","RCM","RM","LST","RST"],"4-3-3":["GK","LB","LCB","RCB","RB","LCM","CDM","RCM","LW","ST","RW"],"3-5-2":["GK","LCB","CB","RCB","LWB","LCM","CDM","RCM","RWB","LST","RST"]};

function getMatchPositions(players,formation){
  const slots=FORMATIONS[formation]||FORMATIONS["4-4-2"];
  return players.map((p,i)=>({...p,x:FULL[slots[i]]?.x||50,y:FULL[slots[i]]?.y||50,role:slots[i]}));
}

const fraXI=[
  {id:63,nm:"Maignan",num:1,pos:"GK",v:48,rt:87,cl:FRA},
  {id:61,nm:"T. Hernández",num:22,pos:"DF",v:62,rt:84,cl:FRA},
  {id:51,nm:"Saliba",num:2,pos:"DF",v:85,rt:88,cl:FRA},
  {id:60,nm:"Upamecano",num:4,pos:"DF",v:55,rt:83,cl:FRA},
  {id:62,nm:"Koundé",num:5,pos:"DF",v:60,rt:85,cl:FRA},
  {id:9,nm:"Barcola",num:29,pos:"MF",v:62,rt:83,cl:FRA},
  {id:10,nm:"Camavinga",num:12,pos:"MF",v:78,rt:85,cl:FRA},
  {id:11,nm:"Tchouaméni",num:8,pos:"MF",v:88,rt:87,cl:FRA},
  {id:99,nm:"Griezmann",num:17,pos:"MF",v:55,rt:84,cl:FRA},
  {id:7,nm:"Mbappé",num:10,pos:"FW",v:195,rt:95,cl:FRA},
  {id:8,nm:"Dembélé",num:11,pos:"FW",v:82,rt:86,cl:FRA},
];
const fraSubs=[
  {id:200,nm:"Areola",num:16,pos:"GK",v:12,rt:76,cl:FRA},{id:201,nm:"Pavard",num:3,pos:"DF",v:35,rt:80,cl:FRA},
  {id:202,nm:"Konaté",num:13,pos:"DF",v:50,rt:83,cl:FRA},{id:203,nm:"Mendy",num:23,pos:"DF",v:28,rt:78,cl:FRA},
  {id:204,nm:"Kanté",num:6,pos:"MF",v:32,rt:81,cl:FRA},{id:205,nm:"Rabiot",num:14,pos:"MF",v:30,rt:79,cl:FRA},
  {id:206,nm:"Fofana",num:19,pos:"MF",v:42,rt:80,cl:FRA},{id:207,nm:"Coman",num:20,pos:"FW",v:38,rt:80,cl:FRA},
  {id:208,nm:"Thuram",num:15,pos:"FW",v:65,rt:83,cl:FRA},{id:209,nm:"Giroud",num:9,pos:"FW",v:15,rt:77,cl:FRA},
  {id:210,nm:"O. Dembélé",num:7,pos:"FW",v:45,rt:81,cl:FRA},
];
const colXI=[
  {id:79,nm:"Vargas",num:1,pos:"GK",v:12,rt:74,cl:COL},
  {id:74,nm:"D. Sánchez",num:23,pos:"DF",v:28,rt:77,cl:COL},
  {id:75,nm:"Lucumí",num:4,pos:"DF",v:32,rt:78,cl:COL},
  {id:77,nm:"Muñoz",num:2,pos:"DF",v:25,rt:76,cl:COL},
  {id:76,nm:"Mojica",num:17,pos:"DF",v:18,rt:74,cl:COL},
  {id:71,nm:"R. Ríos",num:14,pos:"MF",v:38,rt:78,cl:COL},
  {id:72,nm:"Lerma",num:6,pos:"MF",v:30,rt:76,cl:COL},
  {id:73,nm:"James",num:10,pos:"MF",v:22,rt:80,cl:COL},
  {id:70,nm:"Arias",num:11,pos:"MF",v:42,rt:79,cl:COL},
  {id:47,nm:"L. Díaz",num:7,pos:"FW",v:75,rt:85,cl:COL},
  {id:78,nm:"Córdoba",num:9,pos:"FW",v:35,rt:78,cl:COL},
];
const colSubs=[
  {id:300,nm:"Ospina",num:12,pos:"GK",v:8,rt:73,cl:COL},{id:301,nm:"Cuesta",num:15,pos:"DF",v:14,rt:74,cl:COL},
  {id:302,nm:"Borré",num:19,pos:"FW",v:22,rt:76,cl:COL},{id:303,nm:"Sinisterra",num:18,pos:"FW",v:30,rt:78,cl:COL},
  {id:304,nm:"Quintero",num:8,pos:"MF",v:15,rt:76,cl:COL},{id:305,nm:"Uribe",num:16,pos:"MF",v:18,rt:75,cl:COL},
  {id:306,nm:"Mina",num:13,pos:"DF",v:20,rt:76,cl:COL},{id:307,nm:"Machado",num:3,pos:"DF",v:10,rt:72,cl:COL},
  {id:308,nm:"Cuadrado",num:20,pos:"MF",v:12,rt:75,cl:COL},{id:309,nm:"Durán",num:21,pos:"FW",v:28,rt:77,cl:COL},
  {id:310,nm:"Montero",num:22,pos:"DF",v:8,rt:71,cl:COL},
];

const mFraFull=getMatchPositions(fraXI,"4-4-2");
const mColFull=getMatchPositions(colXI,"3-5-2");
const mAllPlayers=[...mFraFull,...mColFull];

const matchFeed=[
  {m:70,t:"🔄",pid:9,head:"Substitution",c:"Barcola makes way for Dembélé."},
  {m:65,t:"🟨",pid:10,head:"Yellow Card",c:"Cynical foul on James driving forward."},
  {m:58,t:"⚽",pid:7,head:"GOAL! France 2-1",c:"Mbappé sends Vargas the wrong way from the spot."},
  {m:55,t:"📊",pid:7,head:"Penalty Won",c:"Mbappé brought down by Lucumí. Clear penalty."},
  {m:41,t:"🟨",pid:72,head:"Yellow Card",c:"Reckless challenge on Tchouaméni."},
  {m:34,t:"⚽",pid:47,head:"GOAL! France 1-1",c:"Brilliant counter! Díaz slots past Maignan."},
  {m:18,t:"🧤",pid:63,head:"Great Save",c:"Maignan flies across and tips Díaz's effort wide."},
  {m:12,t:"⚽",pid:7,head:"GOAL! France 1-0",c:"Mbappé guides Griezmann's cross in with his left foot."},
];


function MatchTradePanel({p,pChg,pChartPts,onClose,onProfile,goPortfolio}){
  const chg=changes[p.id]||0;

  const sheetStyle={position:"absolute",bottom:0,left:0,right:0,background:"rgba(2,4,6,.95)",backdropFilter:"blur(20px) saturate(1.5)",borderRadius:"18px 18px 0 0",border:"1px solid rgba(255,255,255,.08)",borderBottom:"none",padding:"6px 14px",paddingBottom:"max(16px,env(safe-area-inset-bottom))",boxShadow:"0 -8px 40px rgba(0,0,0,.5)",animation:"slideUp .25s ease",zIndex:20};
  const handle=<div style={{display:"flex",justifyContent:"center",marginBottom:6}}><div style={{width:32,height:3,borderRadius:2,background:"rgba(255,255,255,.15)"}}/></div>;

  return (
    <div style={sheetStyle}>
      {handle}
      {/* Player info header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div><div style={{display:"flex",alignItems:"center",gap:5}}><PB p={p.pos}/><span style={{fontSize:15,fontWeight:800}}>{p.fn||p.nm}</span></div><div style={{fontSize:12,color:"rgba(255,255,255,.35)",marginTop:2}}>#{p.num}</div></div>
        <div onClick={onClose} style={{width:28,height:28,borderRadius:7,background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"rgba(255,255,255,.35)",cursor:"pointer"}}>✕</div>
      </div>

      {/* KPIs row */}
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <div><div style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>Value</div><div className="mono" style={{fontSize:15,fontWeight:800}}>€{p.v}M</div></div>
        <div style={{textAlign:"center"}}><div style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>In-Game</div><div className="mono" style={{fontSize:14,fontWeight:700,color:pChg>=0?"#37ff63":"#ff285d"}}>{pChg>=0?"+":""}{pChg}%</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>Rating</div><div className="mono" style={{fontSize:14,fontWeight:800,color:"rgba(255,255,255,.5)"}}>{p.rt}</div></div>
      </div>

      {/* Mini chart */}
      {pChartPts.length>1&&(()=>{const w=300,h=36,pd=3;const mn=Math.min(...pChartPts),mx=Math.max(...pChartPts),r=mx-mn||1;const pts=pChartPts.map((v,i)=>({x:pd+(i/(pChartPts.length-1))*(w-pd*2),y:pd+((mx-v)/r)*(h-pd*2)}));const ln=pts.map(pt=>`${pt.x},${pt.y}`).join(" ");const col=pChg>=0?"#37ff63":"#ff285d";return(<div style={{marginBottom:8}}><svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}><defs><linearGradient id="ipc4" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".15"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs><polygon points={`${pts[0].x},${h-pd} ${ln} ${pts[pts.length-1].x},${h-pd}`} fill="url(#ipc4)"/><polyline points={ln} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round"/></svg></div>);})()}

      {/* Profile button */}
      <button onClick={onProfile} style={{width:"100%",padding:"10px 0",fontSize:13,fontWeight:700,borderRadius:10,background:"rgba(255,255,255,.08)",color:"#fff",border:"none",cursor:"pointer",fontFamily:"inherit",marginBottom:8}}>Full Profile →</button>

      {/* Trade — reuses same TradeFlow as PlayerSheet */}
      <TradeFlow player={p} goPortfolio={()=>{onClose();goPortfolio&&goPortfolio();}}/>
    </div>
  );
}


function MatchView({match,onBack,onPlayer,goPortfolio}){
  const hN=N[match.home],aN=N[match.away];
  const[picked,setPicked]=useState(null);
  const[viewMode,setViewMode]=useState("pitch");
  const[teamTab,setTeamTab]=useState("fra");

  const players=teamTab==="fra"?mFraFull:mColFull;
  const teamColor=teamTab==="fra"?FRA:COL;
  const feedChron=[...matchFeed].reverse();

  const pChg=picked?(changes[picked.id]||0):0;
  const pEvents=picked?(match.events||[]).filter(e=>e.pid===picked.id):[];
  const curve=picked&&match.playerCurves?.[picked.id];
  const pChartPts=curve?curve.map(c=>c.pf):picked?Array.from({length:10},(_,i)=>pChg*(i/9)):[];

  const lerp=(a,b,t)=>a+(b-a)*t;

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",position:"relative"}}>
      {/* Score header */}
      <div style={{flexShrink:0,borderBottom:"1px solid rgba(255,255,255,.05)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px 3px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <button onClick={onBack} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",borderRadius:6,padding:"7px 12px",color:"rgba(255,255,255,.35)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>←</button>
            <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",background:"rgba(255,255,255,.1)",padding:"4px 9px",borderRadius:8}}><span style={{width:4,height:4,borderRadius:"50%",background:"rgba(255,255,255,.5)",display:"inline-block",marginRight:3,animation:"pulse 1.5s infinite"}}/>72'</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:13}}>🇫🇷</span>
              <span className="mono" style={{fontSize:16,fontWeight:900}}>2 : 1</span>
              <span style={{fontSize:13}}>🇨🇴</span>
            </div>
            <div style={{display:"flex",gap:12,marginTop:2}}>
              <span style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>⚽ Mbappé 12', 58'</span>
              <span style={{width:1,background:"rgba(255,255,255,.06)"}}/>
              <span style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>⚽ L. Díaz 34'</span>
            </div>
          </div>
          <div style={{display:"flex",background:"rgba(255,255,255,.03)",borderRadius:7,padding:2}}>
            {[{k:"pitch",l:"⬡"},{k:"list",l:"☰"}].map(m=>(
              <button key={m.k} onClick={()=>setViewMode(m.k)} style={{padding:"7px 12px",borderRadius:6,fontSize:12,border:"none",cursor:"pointer",fontFamily:"inherit",background:viewMode===m.k?"rgba(255,255,255,.08)":"transparent",color:viewMode===m.k?"#fff":"rgba(255,255,255,.15)"}}>{m.l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode==="pitch"?(
        <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
          {/* Team tabs */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 10px 0",zIndex:12}}>
            <div style={{display:"flex",background:"rgba(255,255,255,.03)",borderRadius:7,padding:2}}>
              {[{k:"fra",l:"🇫🇷 FRA"},{k:"col",l:"🇨🇴 COL"}].map(t=>(
                <button key={t.k} onClick={()=>setTeamTab(t.k)} style={{padding:"3px 12px",borderRadius:6,fontSize:11,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit",background:teamTab===t.k?"rgba(255,255,255,.08)":"transparent",color:teamTab===t.k?"#fff":"rgba(255,255,255,.15)"}}>{t.l}</button>
              ))}
            </div>
            <span style={{fontSize:11,color:"rgba(255,255,255,.15)",fontWeight:600,background:"rgba(255,255,255,.03)",padding:"2px 8px",borderRadius:5}}>{teamTab==="fra"?"4-4-2":"3-5-2"}</span>
          </div>

          {/* SVG Pitch */}
          <div style={{flex:1,position:"relative",minHeight:0}} onClick={()=>setPicked(null)}>
            <svg viewBox="0 0 400 280" style={{position:"absolute",inset:0,width:"100%",height:"100%"}} preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="pSurf2" x1=".1" y1="0" x2=".5" y2="1"><stop offset="0%" stopColor="#060d18"/><stop offset="40%" stopColor="#081220"/><stop offset="70%" stopColor="#0a1525"/><stop offset="100%" stopColor="#040810"/></linearGradient>
                <linearGradient id="lnG2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(255,255,255,.06)"/><stop offset="100%" stopColor="rgba(255,255,255,.12)"/></linearGradient>
                <radialGradient id="ccG2" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(255,255,255,.03)"/><stop offset="100%" stopColor="transparent"/></radialGradient>
                <radialGradient id="spot2" cx="50%" cy="35%" r="55%"><stop offset="0%" stopColor={`${teamColor}0c`}/><stop offset="100%" stopColor="transparent"/></radialGradient>
                <filter id="glow2"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              </defs>
              <ellipse cx="200" cy="275" rx="180" ry="10" fill="rgba(0,0,0,.3)"/>
              <ellipse cx="200" cy="277" rx="145" ry="6" fill="rgba(0,0,0,.2)"/>
              {(()=>{
                const TL={x:80,y:8},TR={x:320,y:8},BL={x:0,y:272},BR={x:400,y:272};
                const ptAt=(xP,yP)=>{const lx=lerp(TL.x,BL.x,yP),rx=lerp(TR.x,BR.x,yP);return{x:lerp(lx,rx,xP),y:lerp(TL.y,BL.y,yP)};};
                const fTL=ptAt(.04,.03),fTR=ptAt(.96,.03),fBL=ptAt(.04,.97),fBR=ptAt(.96,.97);
                const hL=ptAt(.04,.5),hR=ptAt(.96,.5),ctr=ptAt(.5,.5);
                return <>
                  <polygon points={`${TL.x},${TL.y} ${TR.x},${TR.y} ${BR.x},${BR.y} ${BL.x},${BL.y}`} fill="url(#pSurf2)"/>
                  <polygon points={`${TL.x},${TL.y} ${TR.x},${TR.y} ${BR.x},${BR.y} ${BL.x},${BL.y}`} fill="url(#spot2)"/>
                  <line x1={TL.x} y1={TL.y} x2={TR.x} y2={TR.y} stroke="rgba(255,255,255,.07)" strokeWidth=".8"/>
                  <line x1={TL.x} y1={TL.y} x2={BL.x} y2={BL.y} stroke="rgba(255,255,255,.025)" strokeWidth=".4"/>
                  <line x1={TR.x} y1={TR.y} x2={BR.x} y2={BR.y} stroke="rgba(255,255,255,.025)" strokeWidth=".4"/>
                  <line x1={BL.x} y1={BL.y} x2={BR.x} y2={BR.y} stroke="rgba(255,255,255,.05)" strokeWidth=".8"/>
                  <polygon points={`${BL.x},${BL.y} ${BR.x},${BR.y} ${BR.x+1},${BR.y+4} ${BL.x-1},${BL.y+4}`} fill="#020406"/>
                  {[0,2,4,6,8,10].map(i=>{const t1=i/12,t2=(i+1)/12;return <polygon key={i} points={`${lerp(TL.x,BL.x,t1)},${lerp(TL.y,BL.y,t1)} ${lerp(TR.x,BR.x,t1)},${lerp(TR.y,BR.y,t1)} ${lerp(TR.x,BR.x,t2)},${lerp(TR.y,BR.y,t2)} ${lerp(TL.x,BL.x,t2)},${lerp(TL.y,BL.y,t2)}`} fill="rgba(255,255,255,.01)"/>;})}
                  <polygon points={`${fTL.x},${fTL.y} ${fTR.x},${fTR.y} ${fBR.x},${fBR.y} ${fBL.x},${fBL.y}`} fill="none" stroke="url(#lnG2)" strokeWidth=".8" strokeLinejoin="round"/>
                  <line x1={hL.x} y1={hL.y} x2={hR.x} y2={hR.y} stroke="rgba(255,255,255,.1)" strokeWidth=".6"/>
                  <ellipse cx={ctr.x} cy={ctr.y} rx="38" ry="22" fill="url(#ccG2)" stroke="rgba(255,255,255,.07)" strokeWidth=".5"/>
                  <circle cx={ctr.x} cy={ctr.y} r="2" fill="rgba(255,255,255,.1)"/>
                  {(()=>{const a=ptAt(.22,.03),b=ptAt(.78,.03),c=ptAt(.78,.18),d=ptAt(.22,.18);const ga=ptAt(.32,.03),gb=ptAt(.68,.03),gc=ptAt(.68,.09),gd=ptAt(.32,.09);const sp=ptAt(.5,.13);return <><polygon points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth=".5"/><polygon points={`${ga.x},${ga.y} ${gb.x},${gb.y} ${gc.x},${gc.y} ${gd.x},${gd.y}`} fill="none" stroke="rgba(255,255,255,.035)" strokeWidth=".4"/><circle cx={sp.x} cy={sp.y} r="1.2" fill="rgba(255,255,255,.06)"/></>;})()}
                  {(()=>{const a=ptAt(.22,.82),b=ptAt(.78,.82),c=ptAt(.78,.97),d=ptAt(.22,.97);const ga=ptAt(.32,.91),gb=ptAt(.68,.91),gc=ptAt(.68,.97),gd=ptAt(.32,.97);const sp=ptAt(.5,.87);return <><polygon points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth=".5"/><polygon points={`${ga.x},${ga.y} ${gb.x},${gb.y} ${gc.x},${gc.y} ${gd.x},${gd.y}`} fill="none" stroke="rgba(255,255,255,.035)" strokeWidth=".4"/><circle cx={sp.x} cy={sp.y} r="1.2" fill="rgba(255,255,255,.06)"/></>;})()}
                  {/* Players — circle style */}
                  {players.map(p=>{
                    const chg=changes[p.id]||0;const sel=picked?.id===p.id;
                    const chgCol=chg>0?"#37ff63":chg<0?"#ff285d":"rgba(255,255,255,.25)";
                    const yT=p.y/100;
                    const lx=lerp(fTL.x,fBL.x,yT),rx=lerp(fTR.x,fBR.x,yT);
                    const px=lerp(lx,rx,p.x/100),py=lerp(fTL.y,fBL.y,yT);
                    const r=sel?17:13,fs=sel?13:11,nFs=9,chgFs=6.5;
                    const bdr=sel?"#fff":chg>0?"rgba(55,255,99,.55)":chg<0?"rgba(255,40,93,.45)":"rgba(255,255,255,.12)";
                    const pillW=Math.max(36,p.nm.length*5+12),pillH=12,pillY=py+r+4;
                    return (
                      <g key={p.id} onClick={e=>{e.stopPropagation();setPicked(p);}} style={{cursor:"pointer",opacity:picked&&!sel?0.4:1,transition:"opacity .2s"}}>
                        {sel&&<circle cx={px} cy={py} r={r+6} fill="none" stroke={`${p.cl}44`} strokeWidth="2" filter="url(#glow2)"/>}
                        <ellipse cx={px} cy={py+r+2} rx={r*.65} ry={2} fill="rgba(0,0,0,.25)"/>
                        <circle cx={px} cy={py} r={r} fill={`${p.cl}aa`} stroke={bdr} strokeWidth={sel?"2.5":"1.5"}/>
                        <circle cx={px-r*.15} cy={py-r*.15} r={r*.35} fill={`${p.cl}25`}/>
                        <text x={px} y={py+fs*.33} textAnchor="middle" fill="#fff" fontSize={fs} fontWeight="800" fontFamily="'Space Mono',monospace">{p.num}</text>
                        <rect x={px-pillW/2} y={pillY} width={pillW} height={pillH} rx={pillH/2} fill="rgba(6,7,11,.85)" stroke="rgba(255,255,255,.06)" strokeWidth=".5"/>
                        <text x={px} y={pillY+pillH*.72} textAnchor="middle" fill="rgba(255,255,255,.95)" fontSize={nFs} fontWeight="700" fontFamily="'Inter',sans-serif">{p.nm}</text>
                        {chg!==0&&<><rect x={px-13} y={pillY+pillH+2} width={26} height={9} rx={3} fill={chg>0?"rgba(55,255,99,.15)":"rgba(255,255,255,.12)"}/><text x={px} y={pillY+pillH+9} textAnchor="middle" fill={chgCol} fontSize={chgFs} fontWeight="700" fontFamily="'Space Mono',monospace">{chg>0?"+":""}{chg}%</text></>}
                      </g>
                    );
                  })}
                </>;
              })()}
            </svg>
          </div>

          {/* Live Commentary */}
          <div style={{background:"rgba(2,4,6,.95)",backdropFilter:"blur(16px)",borderTop:"1px solid rgba(55,255,99,.12)",zIndex:12}}>
            <div style={{padding:"5px 12px 2px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:"rgba(255,255,255,.5)",animation:"pulse 1.5s infinite"}}/>
                <span style={{fontSize:12,fontWeight:700,color:"#fff"}}>Match Commentary</span>
              </div>
              <span style={{fontSize:11,color:"rgba(255,255,255,.15)",fontStyle:"italic"}}>{matchFeed.length} events · scroll ↑</span>
            </div>
            <div style={{maxHeight:115,overflowY:"auto",padding:"0 8px 8px",display:"flex",flexDirection:"column-reverse"}}>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {feedChron.map((ev,i)=>{
                  const imp=ev.t==="⚽"?"#37ff63":ev.t==="🟨"?"rgba(255,255,255,.5)":ev.t==="🧤"?"rgba(255,255,255,.5)":"rgba(255,255,255,.35)";
                  const isGoal=ev.t==="⚽";
                  return (
                    <div key={i} onClick={()=>{const pl=mAllPlayers.find(p=>p.id===ev.pid);if(pl)setPicked(pl);}} style={{display:"flex",gap:8,padding:"6px 8px",borderRadius:10,background:isGoal?"rgba(55,255,99,.06)":"rgba(255,255,255,.02)",border:`1px solid ${isGoal?"rgba(55,255,99,.1)":"rgba(255,255,255,.04)"}`,cursor:"pointer",borderLeft:`3px solid ${imp}`}}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:26,gap:1}}>
                        <span className="mono" style={{fontSize:12,color:imp,fontWeight:800}}>{ev.m}'</span>
                        <span style={{fontSize:14}}>{ev.t}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:isGoal?800:600,color:isGoal?"#fff":"rgba(255,255,255,.6)",marginBottom:1}}>{ev.head}</div>
                        <div style={{fontSize:11,color:"rgba(255,255,255,.25)",lineHeight:1.5}}>{ev.c}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ):(
        /* List view */
        <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"6px 10px",borderBottom:"1px solid rgba(255,255,255,.04)",flexShrink:0}}>
            <div style={{display:"flex",background:"rgba(255,255,255,.03)",borderRadius:7,padding:2}}>
              {[{k:"fra",l:"🇫🇷 FRA"},{k:"col",l:"🇨🇴 COL"}].map(t=>(
                <button key={t.k} onClick={()=>setTeamTab(t.k)} style={{padding:"3px 14px",borderRadius:6,fontSize:11,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit",background:teamTab===t.k?"rgba(255,255,255,.08)":"transparent",color:teamTab===t.k?"#fff":"rgba(255,255,255,.15)"}}>{t.l}</button>
              ))}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            <div style={{padding:"5px 10px 3px",fontSize:11,fontWeight:700,color:"rgba(255,255,255,.35)",letterSpacing:.3}}>STARTING XI</div>
            {(teamTab==="fra"?mFraFull:mColFull).map(p=>{const chg=changes[p.id]||0;const sel=picked?.id===p.id;return(
              <div key={p.id} onClick={()=>setPicked(p)} style={{display:"flex",alignItems:"center",padding:"7px 10px",gap:8,borderBottom:"1px solid rgba(255,255,255,.02)",background:sel?"rgba(55,255,99,.06)":"transparent",cursor:"pointer"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:`radial-gradient(circle at 40% 30%,${p.cl}cc,${p.cl}55)`,border:`1.5px solid ${sel?"#fff":"rgba(255,255,255,.1)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff",flexShrink:0}}>{p.num}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700}}>{p.nm}</div><div style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>{p.role}</div></div>
                <div className="mono" style={{fontSize:11,fontWeight:700}}>€{p.v}M</div>
                <div className="mono" style={{fontSize:11,fontWeight:700,color:chg>=0?"#37ff63":"#ff285d",minWidth:32,textAlign:"right"}}>{chg>=0?"+":""}{chg}%</div>
                <div className="mono" style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.5)",background:"rgba(55,255,99,.1)",padding:"2px 5px",borderRadius:5}}>{p.rt}</div>
              </div>
            );})}
            <div style={{padding:"8px 10px 3px",fontSize:11,fontWeight:700,color:"rgba(255,255,255,.25)",letterSpacing:.3,borderTop:"1px solid rgba(255,255,255,.04)",marginTop:4}}>SUBSTITUTES</div>
            {(teamTab==="fra"?fraSubs:colSubs).map(p=>{const chg=changes[p.id]||0;return(
              <div key={p.id} onClick={()=>setPicked(p)} style={{display:"flex",alignItems:"center",padding:"7px 10px",gap:8,borderBottom:"1px solid rgba(255,255,255,.02)",cursor:"pointer",opacity:.7}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:`radial-gradient(circle at 40% 30%,${p.cl}cc,${p.cl}55)`,border:"1.5px solid rgba(255,255,255,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff",flexShrink:0}}>{p.num}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700}}>{p.nm}</div><div style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>{p.pos}</div></div>
                <div className="mono" style={{fontSize:11,fontWeight:700}}>€{p.v}M</div>
                <div className="mono" style={{fontSize:11,fontWeight:700,color:chg>=0?"#37ff63":"#ff285d",minWidth:32,textAlign:"right"}}>{chg>=0?"+":""}{chg}%</div>
                <div className="mono" style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.5)",background:"rgba(55,255,99,.1)",padding:"2px 5px",borderRadius:5}}>{p.rt}</div>
              </div>
            );})}
          </div>
        </div>
      )}

      {/* Bottom sheet — full trade panel */}
      {picked&&(()=>{
        const chg=changes[picked.id]||0;
        const isUp=chg>=0;
        return (
          <MatchTradePanel p={picked} pChg={pChg} pChartPts={pChartPts} onClose={()=>setPicked(null)} onProfile={()=>onPlayer&&onPlayer(picked)} goPortfolio={goPortfolio}/>
        );
      })()}
      {!picked&&viewMode==="pitch"&&(
        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"10px",textAlign:"center",background:"linear-gradient(transparent,rgba(2,4,6,.8))"}}>
          <span style={{fontSize:11,color:"rgba(255,255,255,.15)"}}>👆 Tap a player to trade</span>
        </div>
      )}
    </div>
  );
}


function HomeTab({onPlayer,goTab,openMatch,ptf,watchlist,toggleWatch}){
  const movers=useMemo(()=>[...P].sort((a,b)=>b.ch-a.ch).slice(0,8),[]);
  const upcoming=FIX.filter(x=>x.s==="UP").slice(0,4);
  const watched=useMemo(()=>P.filter(p=>watchlist?.has(p.id)),[watchlist]);
  const tv=ptf?.tv||0,pnl=ptf?.pnl||0,ret=ptf?.ret||0;
  return (
    <div style={{padding:"0 20px 32px",animation:"fu .4s ease"}}>

      {/* ── HERO: Portfolio ── */}
      <div onClick={()=>goTab("portfolio")} style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:20,padding:"24px 20px",marginBottom:24,cursor:"pointer"}}>
        <div style={{fontSize:13,color:"rgba(255,255,255,.35)",marginBottom:6}}>Portfolio Value</div>
        <div style={{display:"flex",alignItems:"baseline",gap:12}}>
          <span className="mono" style={{fontSize:34,fontWeight:800,letterSpacing:-1.5}}>€{(tv/1000).toFixed(1)}k</span>
          <span className={"ch "+(ret>=0?"cu":"cn")} style={{fontSize:14,padding:"5px 12px"}}>{ret>=0?"+":""}{ret.toFixed(1)}%</span>
        </div>
        <div style={{display:"flex",gap:24,marginTop:14}}>
          {[{l:"P&L",v:(pnl>=0?"+":"")+"€"+(pnl/1000).toFixed(1)+"k",c:pnl>=0?"#37ff63":"#ff285d"},{l:"Rank",v:"#3"},{l:"Players",v:MYPORT.length}].map((s,i)=>(
            <div key={i}><div style={{fontSize:12,color:"rgba(255,255,255,.25)",marginBottom:2}}>{s.l}</div><div className="mono" style={{fontSize:15,fontWeight:700,color:s.c||"#fff"}}>{s.v}</div></div>
          ))}
        </div>
      </div>

      {/* ── LEAGUES — horizontal scroll ── */}
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:16,fontWeight:800}}>Your Leagues</span>
          <span onClick={()=>goTab("leaderboard")} style={{fontSize:13,color:"rgba(255,255,255,.35)",fontWeight:600,cursor:"pointer",padding:"8px 0"}}>See all →</span>
        </div>
        <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:6}}>
          {LEAGUES.map(lg=>{const me=lg.lb.find(l=>l.me);if(!me)return null;return (
            <div key={lg.id} onClick={()=>goTab("leaderboard")} style={{minWidth:160,flexShrink:0,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:16,padding:"16px",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:20}}>{lg.icon}</span>
                <div>
                  <div style={{fontSize:14,fontWeight:700}}>{lg.nm}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>{lg.members} {lg.isPublic?"players":"members"}</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between"}}>
                <div className="mono" style={{fontSize:24,fontWeight:900}}>#{me.rk}</div>
                <div className="mono" style={{fontSize:14,fontWeight:700,color:me.ret>=0?"#37ff63":"#ff285d"}}>{me.ret>=0?"+":""}{me.ret}%</div>
              </div>
            </div>
          );})}
        </div>
      </div>

      {/* ── LIVE MATCH ── */}
      <div onClick={()=>openMatch(LIVE_MATCH)} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",borderRadius:20,padding:"18px 20px",marginBottom:28,cursor:"pointer",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)",animation:"glow 2s infinite"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <Live/>
          <span className="mono" style={{fontSize:14,color:"rgba(255,255,255,.5)",fontWeight:700}}>72'</span>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:20}}>
          <div style={{textAlign:"center",flex:1}}><div style={{fontSize:32}}>🇫🇷</div><div style={{fontSize:14,fontWeight:700,marginTop:4}}>France</div></div>
          <div className="mono" style={{fontSize:36,fontWeight:900,letterSpacing:-2}}>2 : 1</div>
          <div style={{textAlign:"center",flex:1}}><div style={{fontSize:32}}>🇨🇴</div><div style={{fontSize:14,fontWeight:700,marginTop:4}}>Colombia</div></div>
        </div>
        <div style={{marginTop:10,display:"flex",justifyContent:"center",gap:16,fontSize:12,color:"rgba(255,255,255,.35)"}}>
          <span>Mbappé <span style={{color:"#37ff63",fontWeight:700}}>+3.2%</span></span>
          <span>Díaz <span style={{color:"#ff285d",fontWeight:700}}>-1.8%</span></span>
        </div>
      </div>

      {/* ── UPCOMING FIXTURES ── */}
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:16,fontWeight:800}}>Upcoming</span>
          <span onClick={()=>goTab("fixtures")} style={{fontSize:13,color:"rgba(255,255,255,.35)",fontWeight:600,cursor:"pointer",padding:"8px 0"}}>All fixtures →</span>
        </div>
        {upcoming.map((x,i)=>{const hN=N[x.h],aN=N[x.a];if(!hN||!aN)return null;return (
          <div key={x.id} style={{display:"flex",alignItems:"center",padding:"14px 16px",background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.05)",borderRadius:14,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
              <span style={{fontSize:20}}>{hN.f}</span>
              <span style={{fontSize:13,fontWeight:700}}>{hN.n}</span>
            </div>
            <div style={{textAlign:"center",minWidth:56}}>
              <div className="mono" style={{fontSize:12,color:"rgba(255,255,255,.15)",fontWeight:700}}>VS</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.25)",marginTop:1}}>{x.dt}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flex:1,justifyContent:"flex-end"}}>
              <span style={{fontSize:13,fontWeight:700}}>{aN.n}</span>
              <span style={{fontSize:20}}>{aN.f}</span>
            </div>
          </div>
        );})}
      </div>

      {/* ── MARKET NEWS ── */}
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:16,fontWeight:800}}>Market News</span>
          <span style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Today</span>
        </div>
        {[
          {icon:"🏥",text:"Salah limping in training — Egypt camp concerned",player:"Salah",impact:"-3.2%",color:"#ff285d",pid:38},
          {icon:"⚡",text:"Yamal named in ESPN Best XI — social media surge",player:"Yamal",impact:"+2.1%",color:"#37ff63",pid:16},
          {icon:"💬",text:"Mbappé confirmed as captain for Colombia clash",player:"Mbappé",impact:"+0.8%",color:"#37ff63",pid:7},
          {icon:"📊",text:"Haaland tops expected goals chart after Norway win",player:"Haaland",impact:"+1.4%",color:"#37ff63",pid:26},
        ].map((news,i)=>(
          <div key={i} onClick={()=>{const p=P.find(x=>x.id===news.pid);if(p)onPlayer(p);}} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"14px 0",borderBottom:i<3?"1px solid rgba(255,255,255,.04)":"none",cursor:"pointer"}}>
            <span style={{fontSize:20,flexShrink:0,marginTop:2}}>{news.icon}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,lineHeight:1.5,color:"rgba(255,255,255,.7)"}}>{news.text}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                <span style={{fontSize:12,color:"rgba(255,255,255,.35)"}}>{news.player}</span>
                <span className="mono" style={{fontSize:13,fontWeight:700,color:news.color}}>{news.impact}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── WATCHING ── */}
      {watched.length>0&&(
        <div style={{marginBottom:28}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span style={{fontSize:16,fontWeight:800}}>Watching ★</span>
            <span style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>{watched.length} players</span>
          </div>
          {watched.map((p,i)=>{const n=N[p.nt];return (
            <div key={p.id} style={{display:"flex",alignItems:"center",padding:"14px 0",borderBottom:i<watched.length-1?"1px solid rgba(255,255,255,.04)":"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flex:1,cursor:"pointer"}} onClick={()=>onPlayer(p)}>
                <span style={{fontSize:22}}>{n.f}</span>
                <div><div style={{fontSize:14,fontWeight:700}}>{p.nm}</div><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>{n.n}</div></div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{textAlign:"right"}}>
                  <div className="mono" style={{fontSize:14,fontWeight:700}}>€{p.v}M</div>
                  <div className="mono" style={{fontSize:12,fontWeight:700,color:p.ch>=0?"#37ff63":"#ff285d"}}>{p.ch>=0?"+":""}{p.ch}%</div>
                </div>
                <span onClick={()=>toggleWatch&&toggleWatch(p.id)} style={{fontSize:18,color:"rgba(255,255,255,.5)",cursor:"pointer",padding:"8px"}}>★</span>
              </div>
            </div>
          );})}
        </div>
      )}

      {/* ── TOP MOVERS — horizontal scroll ── */}
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:16,fontWeight:800}}>Top Movers 🔥</span>
          <span onClick={()=>goTab("screener")} style={{fontSize:13,color:"rgba(255,255,255,.35)",fontWeight:600,cursor:"pointer",padding:"8px 0"}}>All →</span>
        </div>
        <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8}}>
          {movers.map(p=>{const n=N[p.nt];return (
            <div key={p.id} onClick={()=>onPlayer(p)} style={{minWidth:150,flexShrink:0,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:16,padding:"14px",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:18}}>{n.f}</span>
                <div><div style={{fontSize:13,fontWeight:700}}>{p.nm}</div><div style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>{n.n}</div></div>
              </div>
              <Spark data={genSpark(p.ch,p.id)} color={p.ch>=0?"#37ff63":"#ff285d"} w={120} h={28}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                <span className="mono" style={{fontSize:14,fontWeight:800}}>€{p.v}M</span>
                <span className={"ch "+(p.ch>=0?"cu":"cn")}>{p.ch>=0?"+":""}{p.ch}%</span>
              </div>
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}

/* ═══════ SCREENER ═══════ */
function ScreenerTab({onPlayer,watchlist,toggleWatch}){
  const[posFs,setPosFs]=useState(new Set());
  const[teamFs,setTeamFs]=useState(new Set());
  const[priceRange,setPriceRange]=useState([0,999]);
  const[srt,setSrt]=useState("value");
  const[search,setSearch]=useState("");
  const[showTeams,setShowTeams]=useState(false);
  const[showFilters,setShowFilters]=useState(false);
  const allNations=useMemo(()=>[...new Set(P.map(p=>p.nt))],[]);

  const filtered=useMemo(()=>{
    let l=P;
    if(posFs.size>0) l=l.filter(p=>posFs.has(p.pos));
    if(teamFs.size>0) l=l.filter(p=>teamFs.has(p.nt));
    l=l.filter(p=>p.v>=priceRange[0]&&p.v<=priceRange[1]);
    if(search) l=l.filter(p=>(p.nm+p.fn+(N[p.nt]?.n||"")).toLowerCase().includes(search.toLowerCase()));
    return l.sort((a,b)=>srt==="value"?b.v-a.v:srt==="change"?b.ch-a.ch:srt==="rating"?b.rt-a.rt:srt==="age"?(a.age||99)-(b.age||99):0);
  },[posFs,teamFs,priceRange,srt,search]);

  const hasFilters=posFs.size>0||teamFs.size>0||priceRange[0]>0||priceRange[1]<999;
  const activeCount=(posFs.size)+(teamFs.size)+(priceRange[0]>0||priceRange[1]<999?1:0);

  return (
    <div style={{padding:"0 20px 32px",overflowX:"hidden"}}>

      {/* Search */}
      <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:14,padding:"12px 16px",marginBottom:14}}>
        <span style={{fontSize:18,color:"rgba(255,255,255,.25)"}}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search players, teams..." style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#fff",fontSize:15,fontFamily:"'Inter',sans-serif",minWidth:0}}/>
        {search&&<span onClick={()=>setSearch("")} style={{fontSize:16,color:"rgba(255,255,255,.25)",cursor:"pointer",padding:"4px 8px"}}>✕</span>}
      </div>

      {/* Filter + Sort bar */}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={()=>setShowFilters(!showFilters)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:12,fontSize:13,fontWeight:600,border:"1px solid rgba(255,255,255,.08)",cursor:"pointer",fontFamily:"inherit",background:showFilters||hasFilters?"rgba(255,255,255,.08)":"rgba(255,255,255,.03)",color:showFilters||hasFilters?"#fff":"rgba(255,255,255,.35)"}}>
          ⚙ Filters {activeCount>0&&<span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:11,fontWeight:800}}>{activeCount}</span>}
        </button>
        <div style={{display:"flex",gap:4,flex:1,overflowX:"auto"}}>
          {[{k:"value",l:"Value"},{k:"change",l:"24h %"},{k:"rating",l:"Rating"},{k:"age",l:"Age"}].map(s=>(
            <button key={s.k} onClick={()=>setSrt(s.k)} style={{padding:"10px 14px",borderRadius:12,fontSize:12,fontWeight:srt===s.k?700:500,border:"none",cursor:"pointer",fontFamily:"inherit",background:srt===s.k?"rgba(255,255,255,.08)":"rgba(255,255,255,.03)",color:srt===s.k?"#fff":"rgba(255,255,255,.25)",whiteSpace:"nowrap",flexShrink:0}}>{s.l}{srt===s.k?" ↓":""}</button>
          ))}
        </div>
      </div>

      {/* Expandable filters panel */}
      {showFilters&&(
        <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",borderRadius:16,padding:"16px",marginBottom:14}}>

          {/* Position */}
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:700}}>Position</span>
              {posFs.size>0&&<span onClick={()=>setPosFs(new Set())} style={{fontSize:12,color:"rgba(255,255,255,.35)",fontWeight:600,cursor:"pointer",padding:"4px 0"}}>Reset</span>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {["FW","MF","DF","GK"].map(p=>(
                <button key={p} onClick={()=>toggleSet(posFs,setPosFs,p)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 0",borderRadius:10,fontSize:13,fontWeight:posFs.has(p)?700:500,border:posFs.has(p)?"1px solid rgba(55,255,99,.25)":"1px solid rgba(255,255,255,.06)",cursor:"pointer",fontFamily:"inherit",background:posFs.has(p)?Pcl[p]+"18":"rgba(255,255,255,.03)",color:posFs.has(p)?Pcl[p]:"rgba(255,255,255,.25)",minHeight:40}}>
                  <div style={{width:8,height:8,borderRadius:3,background:Pcl[p],opacity:posFs.has(p)?1:.4}}/>{Pla[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:700}}>Price Range</span>
              {(priceRange[0]>0||priceRange[1]<999)&&<span onClick={()=>setPriceRange([0,999])} style={{fontSize:12,color:"rgba(255,255,255,.35)",fontWeight:600,cursor:"pointer",padding:"4px 0"}}>Reset</span>}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[[0,30],[30,60],[60,100],[100,150],[150,999]].map(([lo,hi])=>{const active=priceRange[0]===lo&&priceRange[1]===hi;return (
                <button key={lo} onClick={()=>setPriceRange(active?[0,999]:[lo,hi])} style={{padding:"8px 14px",borderRadius:10,fontSize:12,fontWeight:active?700:500,border:active?"1px solid rgba(255,255,255,.15)":"1px solid rgba(255,255,255,.06)",cursor:"pointer",fontFamily:"inherit",background:active?"rgba(255,255,255,.08)":"rgba(255,255,255,.03)",color:active?"#fff":"rgba(255,255,255,.25)",minHeight:36}}>{priceLabel(lo)} — {priceLabel(hi)}</button>
              );})}
            </div>
          </div>

          {/* Team */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:700}}>Team {teamFs.size>0?`(${teamFs.size})`:""}</span>
              <div style={{display:"flex",gap:10}}>
                {teamFs.size>0&&<span onClick={()=>setTeamFs(new Set())} style={{fontSize:12,color:"rgba(255,255,255,.35)",fontWeight:600,cursor:"pointer",padding:"4px 0"}}>Reset</span>}
                <span onClick={()=>setShowTeams(!showTeams)} style={{fontSize:12,color:"rgba(255,255,255,.25)",fontWeight:600,cursor:"pointer",padding:"4px 0"}}>{showTeams?"Hide ▲":"Show ▼"}</span>
              </div>
            </div>
            {!showTeams&&teamFs.size>0&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[...teamFs].map(k=>(<span key={k} onClick={()=>toggleSet(teamFs,setTeamFs,k)} style={{fontSize:13,padding:"6px 12px",borderRadius:8,background:"rgba(255,255,255,.08)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:4,minHeight:32}}>{N[k]?.f} {N[k]?.n} <span style={{color:"rgba(255,255,255,.25)"}}>✕</span></span>))}
              </div>
            )}
            {!showTeams&&teamFs.size===0&&(
              <div onClick={()=>setShowTeams(true)} style={{padding:"8px 0",fontSize:13,color:"rgba(255,255,255,.15)",cursor:"pointer"}}>All teams · tap to expand</div>
            )}
            {showTeams&&(
              <div style={{maxHeight:240,overflowY:"auto",paddingTop:4}}>
                {[{c:"UEFA",l:"Europe"},{c:"CONMEBOL",l:"South America"},{c:"CONCACAF",l:"N/C America"},{c:"AFC",l:"Asia"},{c:"CAF",l:"Africa"},{c:"OFC",l:"Oceania"}].map(conf=>{
                  const teams=allNations.filter(k=>N[k]?.c===conf.c);
                  if(teams.length===0) return null;
                  return (
                    <div key={conf.c} style={{marginBottom:12}}>
                      <div style={{fontSize:11,color:"rgba(255,255,255,.15)",fontWeight:700,letterSpacing:.5,marginBottom:6}}>{conf.l}</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {teams.map(k=>{const nt=N[k];const on=teamFs.has(k);return (
                          <button key={k} onClick={()=>toggleSet(teamFs,setTeamFs,k)} style={{padding:"7px 12px",borderRadius:8,fontSize:12,fontWeight:on?700:500,border:on?"1px solid rgba(255,255,255,.15)":"1px solid rgba(255,255,255,.06)",cursor:"pointer",fontFamily:"inherit",background:on?"rgba(255,255,255,.08)":"rgba(255,255,255,.03)",color:on?"#fff":"rgba(255,255,255,.35)",display:"flex",alignItems:"center",gap:5,minHeight:36}}>
                            <span style={{fontSize:15}}>{nt.f}</span>{nt.n}
                          </button>
                        );})}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {hasFilters&&(
            <button onClick={()=>{setPosFs(new Set());setTeamFs(new Set());setPriceRange([0,999]);setShowFilters(false);}} style={{width:"100%",marginTop:14,padding:"10px 0",fontSize:13,fontWeight:700,borderRadius:10,background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.4)",border:"1px solid rgba(255,255,255,.06)",cursor:"pointer",fontFamily:"inherit"}}>Clear all filters</button>
          )}
        </div>
      )}

      {/* Count */}
      <div style={{fontSize:13,color:"rgba(255,255,255,.25)",fontWeight:600,marginBottom:10}}>{filtered.length} players</div>

      {/* Results — CARD with horizontal scrollable stats */}
      {filtered.map(p=>{const n=N[p.nt];const isWatched=watchlist?.has(p.id);const held=MYPORT.find(h=>h.pid===p.id);return (
        <div key={p.id} onClick={()=>onPlayer(p)} style={{background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.05)",borderRadius:16,padding:"14px 16px",marginBottom:10,cursor:"pointer"}}>

          {/* Row 1: Identity */}
          <div style={{display:"flex",alignItems:"center",marginBottom:10}}>
            <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${n.cl}44,${n.cl}22)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{n.f}</div>
            <div style={{flex:1,marginLeft:12,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontSize:16,fontWeight:800}}>{p.nm}</span>
                <PB p={p.pos}/>
                {held&&<span style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.5)",background:"rgba(255,255,255,.06)",padding:"2px 7px",borderRadius:4}}>HELD</span>}
              </div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.25)",marginTop:2}}>{n.n} · {p.club||"—"}</div>
            </div>
            <span onClick={e=>{e.stopPropagation();toggleWatch&&toggleWatch(p.id);}} style={{fontSize:22,color:isWatched?"rgba(255,255,255,.5)":"#2a2d36",cursor:"pointer",padding:"8px",flexShrink:0}}>{isWatched?"★":"☆"}</span>
          </div>

          {/* Row 2: Horizontal scrollable stats band */}
          <div style={{display:"flex",gap:0,overflowX:"auto",margin:"0 -16px",padding:"0 16px"}}>
            {[
              {l:"Value",v:"€"+p.v+"M",mono:true},
              {l:"24h",v:(p.ch>=0?"+":"")+p.ch+"%",c:p.ch>=0?"#37ff63":"#ff285d",mono:true},
              {l:"Rating",v:p.rt,c:"rgba(255,255,255,.5)",mono:true},
              {l:"Age",v:p.age||"—"},
              {l:"Foot",v:p.foot||"—"},
              {l:"Height",v:p.ht||"—"},
            ].map((s,i)=>(
              <div key={i} style={{minWidth:64,padding:"6px 10px",flexShrink:0,borderRight:i<5?"1px solid rgba(255,255,255,.04)":"none"}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,.25)",marginBottom:2}}>{s.l}</div>
                <div className={s.mono?"mono":""} style={{fontSize:14,fontWeight:700,color:s.c||"#fff",whiteSpace:"nowrap"}}>{s.v}</div>
              </div>
            ))}
            {/* Sparkline at end */}
            <div style={{minWidth:80,padding:"6px 8px",flexShrink:0,display:"flex",alignItems:"center"}}>
              <Spark data={genSpark(p.ch,p.id,16)} color={p.ch>=0?"#37ff63":"#ff285d"} w={68} h={28}/>
            </div>
          </div>
        </div>
      );})}
      {filtered.length===0&&<div style={{padding:40,textAlign:"center",color:"rgba(255,255,255,.15)",fontSize:14}}>No players match your filters</div>}
    </div>
  );
}

/* ═══════ FIXTURES ═══════ */
function FixturesTab({openMatch}){
  const[f,sf]=useState("ALL");
  const fx=f==="ALL"?FIX:FIX.filter(x=>x.s===f);
  return (
    <div style={{padding:"0 20px 32px"}}>
      {/* Status filter */}
      <div style={{display:"flex",gap:6,marginBottom:20}}>
        {["ALL","LV","FT","UP"].map(s=>(
          <button key={s} onClick={()=>sf(s)} style={{flex:1,padding:"10px 0",borderRadius:12,fontSize:13,fontWeight:f===s?700:500,border:"none",cursor:"pointer",fontFamily:"inherit",background:f===s?(s==="LV"?"rgba(255,255,255,.08)":"rgba(255,255,255,.08)"):"rgba(255,255,255,.03)",color:f===s?(s==="LV"?"rgba(255,255,255,.5)":"#fff"):"rgba(255,255,255,.25)",textAlign:"center"}}>{s==="ALL"?"All":s==="UP"?"Upcoming":s==="FT"?"Completed":"Live"}</button>
        ))}
      </div>

      {fx.map(x=>{const hN=N[x.h],aN=N[x.a];if(!hN||!aN) return null;const isLv=x.s==="LV",isFT=x.s==="FT";const matchData=MM[x.h+"_"+x.a];const clickable=(isLv||isFT)&&matchData;return (
        <div key={x.id} onClick={()=>clickable&&openMatch(matchData)} style={{background:isLv?"rgba(255,255,255,.04)":"rgba(255,255,255,.025)",border:`1px solid ${isLv?"rgba(255,255,255,.12)":"rgba(255,255,255,.06)"}`,borderRadius:16,padding:"16px 18px",marginBottom:10,cursor:clickable?"pointer":"default",position:"relative",overflow:"hidden"}}>

          {/* Top bar: status + group + date */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {isLv?<Live/>:isFT?<span style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",background:"rgba(255,255,255,.06)",padding:"5px 10px",borderRadius:6}}>FT</span>:<span style={{fontSize:12,color:"rgba(255,255,255,.25)",fontWeight:500}}>Upcoming</span>}
              <span style={{fontSize:11,color:"rgba(255,255,255,.15)",background:"rgba(255,255,255,.04)",padding:"4px 8px",borderRadius:5,fontWeight:600}}>Grp {x.g}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {x.dt&&<span className="mono" style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>{x.dt}</span>}
              {clickable&&<span style={{fontSize:12,color:"rgba(255,255,255,.3)",fontWeight:600}}>→</span>}
            </div>
          </div>

          {/* Score row */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flex:1,justifyContent:"flex-end"}}>
              <span style={{fontSize:14,fontWeight:700}}>{hN.n}</span>
              <span style={{fontSize:26}}>{hN.f}</span>
            </div>
            {x.s!=="UP"
              ?<div className="mono" style={{fontSize:28,fontWeight:900,minWidth:56,textAlign:"center",letterSpacing:-2}}>{x.hs} : {x.as}</div>
              :<div className="mono" style={{fontSize:14,color:"rgba(255,255,255,.15)",fontWeight:700,minWidth:56,textAlign:"center"}}>VS</div>
            }
            <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
              <span style={{fontSize:26}}>{aN.f}</span>
              <span style={{fontSize:14,fontWeight:700}}>{aN.n}</span>
            </div>
          </div>

          {x.nt&&<div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,.25)",marginTop:8}}>{x.nt}</div>}
          {isLv&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)",animation:"glow 2s infinite"}}/>}
        </div>
      );})}
    </div>
  );
}

/* ── PerfC chart (same as desktop) ── */
function PerfC({data,w=350,h=140}){const mn=Math.min(...data.map(d=>d.v)),mx=Math.max(...data.map(d=>d.v)),r=mx-mn||1,pd=12;const pts=data.map((d,i)=>({x:pd+(i/(data.length-1))*(w-pd*2),y:pd+((mx-d.v)/r)*(h-pd*2)}));const ln=pts.map(p=>`${p.x},${p.y}`).join(" ");const last=pts[pts.length-1];const first=pts[0];const isUp=last.y<=first.y;const cl=isUp?"#48ff43":"#ff285d";return (<svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}><defs><linearGradient id="pfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={cl} stopOpacity=".3"/><stop offset="100%" stopColor={cl} stopOpacity="0"/></linearGradient></defs>{[0,.5,1].map((p,i)=>{const y=pd+p*(h-pd*2);return (<line key={i} x1={pd} x2={w-pd} y1={y} y2={y} stroke="rgba(255,255,255,.04)"/>);})}<polygon points={`${pts[0].x},${h-pd} ${ln} ${last.x},${h-pd}`} fill="url(#pfg)"/><polyline points={ln} fill="none" stroke={cl} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".1"/><polyline points={ln} fill="none" stroke={cl} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx={last.x} cy={last.y} r="4" fill={cl}/><circle cx={last.x} cy={last.y} r="9" fill={cl} opacity=".15"/></svg>);}

/* ── Donut chart (same as desktop) ── */
function Donut({segs,sz=90}){const tot=segs.reduce((a,s)=>a+s.v,0);const cx=sz/2,cy=sz/2,rd=sz/2-6;let cm=-90;return (<svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>{segs.map((s,i)=>{const an=(s.v/tot)*360;const st=cm;cm+=an;const r1=(st*Math.PI)/180,r2=((st+an)*Math.PI)/180;return (<path key={i} d={`M ${cx} ${cy} L ${cx+rd*Math.cos(r1)} ${cy+rd*Math.sin(r1)} A ${rd} ${rd} 0 ${an>180?1:0} 1 ${cx+rd*Math.cos(r2)} ${cy+rd*Math.sin(r2)} Z`} fill={s.c} opacity=".85" stroke="#020406" strokeWidth="2"/>);})}<circle cx={cx} cy={cy} r={rd*.55} fill="#020406"/></svg>);}

/* ── Trade History data ── */
const TRADES=[
  {id:1,type:"BUY",pid:7,nm:"Mbappé",nt:"FRA",shares:20,price:168,date:"Jun 12",total:3360},
  {id:2,type:"BUY",pid:26,nm:"Haaland",nt:"NOR",shares:15,price:170,date:"Jun 12",total:2550},
  {id:3,type:"SELL",pid:13,nm:"Saka",nt:"ENG",shares:30,price:138,date:"Jun 13",total:4140},
  {id:4,type:"BUY",pid:16,nm:"Yamal",nt:"ESP",shares:40,price:125,date:"Jun 13",total:5000},
  {id:5,type:"BUY",pid:39,nm:"Marmoush",nt:"EGY",shares:50,price:48,date:"Jun 14",total:2400},
  {id:6,type:"SELL",pid:23,nm:"Ronaldo",nt:"POR",shares:25,price:62,date:"Jun 14",total:1550},
  {id:7,type:"BUY",pid:7,nm:"Mbappé",nt:"FRA",shares:30,price:175,date:"Jun 15",total:5250},
  {id:8,type:"BUY",pid:31,nm:"Gvardiol",nt:"CRO",shares:65,price:68,date:"Jun 15",total:4420},
  {id:9,type:"SELL",pid:45,nm:"De Bruyne",nt:"BEL",shares:20,price:84,date:"Jun 16",total:1680},
  {id:10,type:"BUY",pid:6,nm:"Endrick",nt:"BRA",shares:60,price:52,date:"Jun 16",total:3120},
];

/* ═══════ PORTFOLIO ═══════ */
function PortfolioTab({onPlayer}){
  const hld=useMemo(()=>MYPORT.map(h=>{const p=P.find(x=>x.id===h.pid);if(!p) return null;const n=N[p.nt];const mv=p.v*h.sh;const cb=h.ab*h.sh;return {...h,...p,n,mv,cb,pnl:mv-cb,ret:((mv-cb)/cb)*100};}).filter(Boolean),[]);
  const tv=hld.reduce((a,h)=>a+h.mv,0),tc=hld.reduce((a,h)=>a+h.cb,0),tp=tv-tc,tr=((tv-tc)/tc)*100;

  const byTeam=useMemo(()=>{const m={};hld.forEach(h=>{const k=h.nt;if(!m[k])m[k]={nm:N[k].n,fl:N[k].f,cl:N[k].cl,v:0};m[k].v+=h.mv;});return Object.values(m).map(x=>({...x,pct:((x.v/tv)*100).toFixed(1)})).sort((a,b)=>b.v-a.v);},[hld,tv]);
  const byPos=useMemo(()=>{const m={};hld.forEach(h=>{if(!m[h.pos])m[h.pos]=0;m[h.pos]+=h.mv;});const posCols={FW:"rgba(255,255,255,.7)",MF:"rgba(255,255,255,.45)",DF:"rgba(255,255,255,.25)",GK:"rgba(255,255,255,.12)"};return Object.entries(m).map(([k,v])=>({k,lb:Pla[k],v,cl:posCols[k]||"rgba(255,255,255,.3)",pct:((v/tv)*100).toFixed(1)})).sort((a,b)=>b.v-a.v);},[hld,tv]);
  const byAge=useMemo(()=>{const buckets=[{l:"U21",lo:0,hi:21,cl:"rgba(255,255,255,.7)"},{l:"21-25",lo:21,hi:26,cl:"rgba(255,255,255,.5)"},{l:"26-30",lo:26,hi:31,cl:"rgba(255,255,255,.3)"},{l:"31+",lo:31,hi:99,cl:"rgba(255,255,255,.15)"}];const m={};buckets.forEach(b=>{m[b.l]={...b,v:0};});hld.forEach(h=>{const a=h.age||25;const b=buckets.find(b=>a>=b.lo&&a<b.hi)||buckets[3];m[b.l].v+=h.mv;});return Object.values(m).filter(x=>x.v>0).map(x=>({...x,pct:((x.v/tv)*100).toFixed(1)}));},[hld,tv]);

  const[pp,setPp]=useState("30d");
  const[bk,setBk]=useState("team");
  const[btab,setBtab]=useState("holdings");

  const perfD=useMemo(()=>{const g=(l,vol,tr)=>Array.from({length:l},(_,i)=>({d:i+1,v:Math.round(10000+Math.sin(i/Math.max(3,l/7))*vol+i*tr+Math.sin(i*1.3)*vol*.25)}));return {"inception":g(120,900,42),"30d":g(60,600,80),"7d":g(28,350,110),"24h":g(48,200,55)};},[]);
  const pd=perfD[pp]||perfD["30d"];
  const pRet=pd.length>1?((pd[pd.length-1].v-pd[0].v)/pd[0].v*100):0;
  const sorted=useMemo(()=>[...hld].sort((a,b)=>b.mv-a.mv),[hld]);
  const pLabels={"inception":"Since Inception","30d":"Last 30 Days","7d":"Last 7 Days","24h":"Daily"};

  // Sober monochrome palette for pie chart — white to dark grey
  const chartPalette=["rgba(255,255,255,.7)","rgba(255,255,255,.5)","rgba(255,255,255,.35)","rgba(255,255,255,.22)","rgba(255,255,255,.14)","rgba(255,255,255,.09)","rgba(255,255,255,.06)","rgba(255,255,255,.04)"];

  // Normalized breakdown list — same shape for all tabs
  const bkList=bk==="team"?byTeam.map((t,i)=>({label:t.fl+" "+t.nm,cl:chartPalette[i]||chartPalette[chartPalette.length-1],pct:t.pct,v:t.v})):bk==="position"?byPos.map((p,i)=>({label:p.lb,cl:chartPalette[i]||chartPalette[chartPalette.length-1],pct:p.pct,v:p.v})):byAge.map((a,i)=>({label:a.l,cl:chartPalette[i]||chartPalette[chartPalette.length-1],pct:a.pct,v:a.v}));
  const donutData=bkList.map(x=>({v:x.v,c:x.cl}));

  return (
    <div style={{padding:"0 20px 32px"}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:20}}>
        {[{l:"Total Value",v:"€"+(tv/1000).toFixed(1)+"k"},{l:"P&L",v:(tp>=0?"+":"")+"€"+(tp/1000).toFixed(1)+"k",c:tp>=0?"#37ff63":"#ff285d"},{l:"Return",v:(tr>=0?"+":"")+tr.toFixed(1)+"%",c:tr>=0?"#37ff63":"#ff285d"},{l:"Players",v:hld.length}].map((s,i)=>(
          <div key={i} style={{background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.05)",borderRadius:14,padding:"14px 16px"}}>
            <div style={{fontSize:12,color:"rgba(255,255,255,.25)",marginBottom:3}}>{s.l}</div>
            <div className="mono" style={{fontSize:22,fontWeight:800,color:s.c||"#fff"}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Performance */}
      <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:16,padding:"16px",marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div><div style={{fontSize:15,fontWeight:800}}>Performance</div><div style={{fontSize:12,color:"rgba(255,255,255,.25)",marginTop:2}}>{pLabels[pp]}</div></div>
          <div className="mono" style={{fontSize:16,fontWeight:800,color:pRet>=0?"#37ff63":"#ff285d"}}>{pRet>=0?"+":""}{pRet.toFixed(1)}%</div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {["inception","30d","7d","24h"].map(p=>(
            <button key={p} onClick={()=>setPp(p)} style={{flex:1,padding:"8px 0",borderRadius:8,fontSize:12,fontWeight:pp===p?700:500,border:"none",cursor:"pointer",fontFamily:"inherit",background:pp===p?"rgba(255,255,255,.08)":"rgba(255,255,255,.03)",color:pp===p?"#fff":"rgba(255,255,255,.25)",textAlign:"center"}}>{p==="inception"?"All":p==="24h"?"Daily":p.toUpperCase()}</button>
          ))}
        </div>
        <PerfC data={pd}/>
      </div>

      {/* Breakdown — Team | Position | Age | Long/Short */}
      <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:16,overflow:"hidden",marginBottom:20}}>
        <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
          {[{k:"team",l:"Team"},{k:"position",l:"Position"},{k:"age",l:"Age"},{k:"exposure",l:"Long/Short"}].map(t=>(
            <button key={t.k} onClick={()=>setBk(t.k)} style={{flex:1,padding:"12px 0",fontSize:12,fontWeight:bk===t.k?700:500,border:"none",cursor:"pointer",fontFamily:"inherit",background:"transparent",color:bk===t.k?"#fff":"rgba(255,255,255,.15)",borderBottom:bk===t.k?"2px solid rgba(255,255,255,.4)":"2px solid transparent",transition:"all .15s"}}>{t.l}</button>
          ))}
        </div>
        <div style={{padding:"16px",minHeight:180}}>
          {bk==="exposure"?(()=>{
            const longVal=tv;
            const shortVal=1781;
            const totalExp=longVal+shortVal;
            const longPct=((longVal/totalExp)*100).toFixed(1);
            const shortPct=((shortVal/totalExp)*100).toFixed(1);
            const netExp=longVal-shortVal;
            return (
              <div>
                <div style={{height:36,borderRadius:10,overflow:"hidden",display:"flex",marginBottom:14,border:"1px solid rgba(255,255,255,.06)"}}>
                  <div style={{width:longPct+"%",background:"linear-gradient(135deg,rgba(34,197,94,.25),rgba(34,197,94,.12))",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span className="mono" style={{fontSize:13,fontWeight:800,color:"#37ff63"}}>📈 {longPct}%</span>
                  </div>
                  <div style={{width:shortPct+"%",background:"linear-gradient(135deg,rgba(255,40,93,.25),rgba(255,40,93,.12))",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span className="mono" style={{fontSize:13,fontWeight:800,color:"#ff285d"}}>📉 {shortPct}%</span>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:14,padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                  <div style={{textAlign:"center",flex:1}}><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Long</div><div className="mono" style={{fontSize:16,fontWeight:800,color:"#37ff63",marginTop:2}}>€{(longVal/1000).toFixed(1)}k</div></div>
                  <div style={{textAlign:"center",flex:1,borderLeft:"1px solid rgba(255,255,255,.04)",borderRight:"1px solid rgba(255,255,255,.04)"}}><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Short</div><div className="mono" style={{fontSize:16,fontWeight:800,color:"#ff285d",marginTop:2}}>€{(shortVal/1000).toFixed(1)}k</div></div>
                  <div style={{textAlign:"center",flex:1}}><div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Net</div><div className="mono" style={{fontSize:16,fontWeight:800,color:"rgba(255,255,255,.5)",marginTop:2}}>€{(netExp/1000).toFixed(1)}k</div></div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
                  <span style={{fontSize:13,color:"rgba(255,255,255,.25)"}}>Long/Short Ratio</span>
                  <span className="mono" style={{fontSize:15,fontWeight:800}}>{(longVal/shortVal).toFixed(1)}x</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
                  <span style={{fontSize:13,color:"rgba(255,255,255,.25)"}}>Net Exposure</span>
                  <span className="mono" style={{fontSize:14,fontWeight:700,color:netExp>=0?"#37ff63":"#ff285d"}}>{netExp>=0?"+":""}€{(netExp/1000).toFixed(1)}k</span>
                </div>
              </div>
            );
          })():(
          <div style={{display:"flex",alignItems:"flex-start",gap:20}}>
            <div style={{flexShrink:0,paddingTop:bkList.length<=4?16:0}}><Donut segs={donutData} sz={110}/></div>
            <div style={{flex:1}}>
              {bkList.map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:i<bkList.length-1?"1px solid rgba(255,255,255,.04)":"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:10,height:10,borderRadius:3,background:item.cl,flexShrink:0}}/>
                    <span style={{fontSize:13,fontWeight:500}}>{item.label}</span>
                  </div>
                  <span className="mono" style={{fontSize:13,fontWeight:700,color:item.cl}}>{item.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Holdings / Trade History tabs */}
      <div style={{display:"flex",marginBottom:12,background:"rgba(255,255,255,.03)",borderRadius:12,padding:3}}>
        {[{k:"holdings",l:"Holdings"},{k:"trades",l:"Trade History"}].map(t=>(
          <button key={t.k} onClick={()=>setBtab(t.k)} style={{flex:1,padding:"10px 0",borderRadius:10,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit",background:btab===t.k?"rgba(255,255,255,.08)":"transparent",color:btab===t.k?"#fff":"rgba(255,255,255,.25)",transition:"all .2s"}}>{t.l}</button>
        ))}
      </div>

      {btab==="holdings"&&(
        <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:16,overflow:"hidden"}}>
          {sorted.map((h,i)=>(
            <div key={h.pid} onClick={()=>onPlayer(h)} style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,.04)",cursor:"pointer"}}>
              <span className="mono" style={{fontSize:12,color:"rgba(255,255,255,.15)",minWidth:16}}>{i+1}</span>
              <span style={{fontSize:18}}>{h.n?.f}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:14,fontWeight:700}}>{h.nm}</span><PB p={h.pos}/></div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.25)",marginTop:1}}>{h.sh} shares · avg €{h.ab}M</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div className="mono" style={{fontSize:14,fontWeight:800}}>€{(h.mv/1000).toFixed(1)}k</div>
                <div className="mono" style={{fontSize:12,fontWeight:700,color:h.pnl>=0?"#37ff63":"#ff285d"}}>{h.pnl>=0?"+":""}€{(h.pnl/1000).toFixed(1)}k</div>
                <span className={"ch "+(h.ret>=0?"cu":"cn")}>{h.ret>=0?"+":""}{h.ret.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {btab==="trades"&&(
        <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:16,overflow:"hidden"}}>
          {TRADES.slice().reverse().map((t,i)=>{const nt=N[t.nt];const isBuy=t.type==="BUY";return (
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:i<TRADES.length-1?"1px solid rgba(255,255,255,.04)":"none"}}>
              <span style={{fontSize:12,fontWeight:700,padding:"5px 10px",borderRadius:6,background:isBuy?"rgba(34,197,94,.1)":"rgba(255,40,93,.1)",color:isBuy?"#37ff63":"#ff285d"}}>{t.type}</span>
              <span style={{fontSize:16}}>{nt?.f}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600}}>{t.nm}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>{t.shares} shares @ €{t.price}M</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div className="mono" style={{fontSize:13,fontWeight:700}}>€{(t.total/1000).toFixed(1)}k</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.15)"}}>{t.date}</div>
              </div>
            </div>
          );})}
        </div>
      )}
    </div>
  );
}


/* ═══════ LEADERBOARD ═══════ */
/* ═══ League data ═══ */
const LEAGUES=[
  {id:"global",nm:"Global",icon:"🌍",desc:"All FundXI players worldwide",members:12847,isPublic:true,
    lb:[{rk:1,nm:"ElGauchito",val:14250,ret:42.5,av:"🏆"},{rk:2,nm:"SambaCapital",val:13100,ret:31.0,av:"⚡"},{rk:3,nm:"You",val:12400,ret:24.0,av:"🎯",me:true},{rk:4,nm:"FuryInvestor",val:11800,ret:18.0,av:"🦁"},{rk:5,nm:"TotalFootball",val:11200,ret:12.0,av:"📊"},{rk:6,nm:"PressingHigh",val:10600,ret:6.0,av:"🧠"},{rk:7,nm:"TikiTaka",val:10100,ret:1.0,av:"🔄"},{rk:8,nm:"Counter",val:9700,ret:-3.0,av:"🏃"}]},
  {id:"top100",nm:"Top 100",icon:"💎",desc:"Top 100 traders by return",members:100,isPublic:true,
    lb:[{rk:1,nm:"ElGauchito",val:14250,ret:42.5,av:"🏆"},{rk:2,nm:"SambaCapital",val:13100,ret:31.0,av:"⚡"},{rk:3,nm:"AlphaTrader",val:12900,ret:29.0,av:"🔥"},{rk:4,nm:"You",val:12400,ret:24.0,av:"🎯",me:true},{rk:5,nm:"PitchBoss",val:12100,ret:21.0,av:"⭐"}]},
  {id:"friends1",nm:"La Bande",icon:"🇫🇷",desc:"Private league with friends",members:6,isPublic:false,code:"BANDE26",
    lb:[{rk:1,nm:"You",val:12400,ret:24.0,av:"🎯",me:true},{rk:2,nm:"Karim",val:11600,ret:16.0,av:"🔥"},{rk:3,nm:"Sofiane",val:10800,ret:8.0,av:"⚡"},{rk:4,nm:"Amine",val:10200,ret:2.0,av:"😤"},{rk:5,nm:"Yassine",val:9400,ret:-6.0,av:"💀"},{rk:6,nm:"Mehdi",val:8900,ret:-11.0,av:"📉"}]},
  {id:"work1",nm:"Goldman XI",icon:"🏦",desc:"Office league — Goldman Sachs",members:14,isPublic:false,code:"GS2026X",
    lb:[{rk:1,nm:"DeskAlpha",val:15200,ret:52.0,av:"💰"},{rk:2,nm:"StructuredMike",val:14100,ret:41.0,av:"📊"},{rk:3,nm:"You",val:12400,ret:24.0,av:"🎯",me:true},{rk:4,nm:"DerivQueen",val:12000,ret:20.0,av:"👑"},{rk:5,nm:"JuniorTrader",val:11500,ret:15.0,av:"📈"},{rk:6,nm:"InternLuck",val:10900,ret:9.0,av:"🍀"},{rk:7,nm:"BackOffice",val:9800,ret:-2.0,av:"🤷"}]},
];

function LeaderboardTab(){
  const medals=["🥇","🥈","🥉"];
  const podBg=["rgba(250,204,21,.06)","rgba(192,192,192,.04)","rgba(205,127,50,.04)"];
  const[activeLeague,setActiveLeague]=useState("global");
  const[view,setView]=useState("board"); // "board" | "create" | "join"
  const league=LEAGUES.find(l=>l.id===activeLeague)||LEAGUES[0];
  const[createName,setCreateName]=useState("");
  const[joinCode,setJoinCode]=useState("");
  const[created,setCreated]=useState(null);

  if(view==="create"){
    return (
      <div style={{padding:"0 16px 24px",animation:"fu .2s ease"}}>
        <button onClick={()=>setView("board")} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",borderRadius:8,padding:"5px 12px",color:"rgba(255,255,255,.35)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:18}}>← Back</button>
        {created?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:40,marginBottom:8}}>🎉</div>
            <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>League Created!</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.35)",marginBottom:16}}>{created.name} is ready. Share the code with your friends.</div>
            <div style={{background:"rgba(55,255,99,.1)",border:"1px solid rgba(55,255,99,.2)",borderRadius:12,padding:"16px",marginBottom:16}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,.25)",marginBottom:4}}>INVITE CODE</div>
              <div className="mono" style={{fontSize:28,fontWeight:800,color:"#37ff63",letterSpacing:3}}>{created.code}</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setCreated(null);setView("board");}} style={{flex:1,padding:"12px 0",fontSize:12,fontWeight:700,borderRadius:10,background:"rgba(255,255,255,.08)",color:"#fff",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Go to League</button>
              <button style={{flex:1,padding:"12px 0",fontSize:12,fontWeight:700,borderRadius:10,background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.4)",border:"1px solid rgba(255,255,255,.08)",cursor:"pointer",fontFamily:"inherit"}}>Share Link</button>
            </div>
          </div>
        ):(
          <div>
            <div style={{fontSize:16,fontWeight:800,marginBottom:16}}>Create Private League</div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:"rgba(255,255,255,.25)",fontWeight:600,marginBottom:4}}>LEAGUE NAME</div>
              <input value={createName} onChange={e=>setCreateName(e.target.value)} placeholder="e.g. La Bande, Office League..." style={{width:"100%",padding:"10px 14px",borderRadius:10,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",color:"#fff",fontSize:14,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
            </div>
            <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:12,padding:"14px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,marginBottom:6}}>How it works</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.35)",lineHeight:1.6}}>
                Create a league → get a unique invite code → share with friends, colleagues, anyone → they join with the code → compete on your private leaderboard. Same portfolio, separate rankings.
              </div>
            </div>
            <button onClick={()=>{if(createName.trim()){setCreated({name:createName,code:(createName.slice(0,4).toUpperCase().replace(/\s/g,"")+Math.floor(Math.random()*900+100))});}}} disabled={!createName.trim()} style={{width:"100%",padding:"13px 0",fontSize:13,fontWeight:700,borderRadius:10,background:createName.trim()?"linear-gradient(135deg,#37ff63,#00c853)":"rgba(255,255,255,.04)",color:createName.trim()?"#fff":"rgba(255,255,255,.15)",border:"none",cursor:createName.trim()?"pointer":"default",fontFamily:"inherit"}}>Create League</button>
          </div>
        )}
      </div>
    );
  }

  if(view==="join"){
    return (
      <div style={{padding:"0 16px 24px",animation:"fu .2s ease"}}>
        <button onClick={()=>setView("board")} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",borderRadius:8,padding:"5px 12px",color:"rgba(255,255,255,.35)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:18}}>← Back</button>
        <div style={{fontSize:16,fontWeight:800,marginBottom:16}}>Join a League</div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,.25)",fontWeight:600,marginBottom:4}}>INVITE CODE</div>
          <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. BANDE26" maxLength={10} style={{width:"100%",padding:"10px 14px",borderRadius:10,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",color:"#fff",fontSize:18,fontFamily:"'Space Mono',monospace",fontWeight:700,letterSpacing:3,textAlign:"center",outline:"none"}}/>
        </div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.35)",lineHeight:1.6,marginBottom:16,textAlign:"center"}}>Ask your friend for their league invite code and paste it here.</div>
        <button onClick={()=>setView("board")} disabled={joinCode.length<4} style={{width:"100%",padding:"13px 0",fontSize:13,fontWeight:700,borderRadius:10,background:joinCode.length>=4?"linear-gradient(135deg,#22c55e,#16a34a)":"rgba(255,255,255,.04)",color:joinCode.length>=4?"#fff":"rgba(255,255,255,.15)",border:"none",cursor:joinCode.length>=4?"pointer":"default",fontFamily:"inherit"}}>Join League</button>
      </div>
    );
  }

  return (
    <div style={{padding:"0 20px 32px"}}>
      {/* League selector */}
      <div style={{display:"flex",gap:8,overflowX:"auto",marginBottom:14,paddingBottom:4}}>
        {LEAGUES.map(l=>{const active=l.id===activeLeague;return (
          <button key={l.id} onClick={()=>setActiveLeague(l.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:12,border:active?"1px solid rgba(55,255,99,.3)":"1px solid rgba(255,255,255,.06)",background:active?"rgba(55,255,99,.12)":"rgba(255,255,255,.03)",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
            <span style={{fontSize:18}}>{l.icon}</span>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:13,fontWeight:active?700:500,color:active?"#fff":"rgba(255,255,255,.35)"}}>{l.nm}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.15)"}}>{l.members} {l.isPublic?"players":"members"}</div>
            </div>
          </button>
        );})}
      </div>

      {/* Create / Join */}
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        <button onClick={()=>setView("create")} style={{flex:1,padding:"13px 0",fontSize:13,fontWeight:700,borderRadius:12,background:"rgba(255,255,255,.08)",color:"#fff",border:"none",cursor:"pointer",fontFamily:"inherit"}}>+ Create League</button>
        <button onClick={()=>setView("join")} style={{flex:1,padding:"13px 0",fontSize:13,fontWeight:700,borderRadius:12,background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.4)",border:"1px solid rgba(255,255,255,.08)",cursor:"pointer",fontFamily:"inherit"}}>Join with Code</button>
      </div>

      {/* League header */}
      <div style={{background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.05)",borderRadius:16,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:26}}>{league.icon}</span>
          <div>
            <div style={{fontSize:16,fontWeight:800}}>{league.nm}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>{league.desc}</div>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>{league.members} {league.isPublic?"players":"members"}</div>
          {!league.isPublic&&league.code&&<div className="mono" style={{fontSize:12,color:"#37ff63",marginTop:2}}>Code: {league.code}</div>}
        </div>
      </div>

      {/* Your rank */}
      {(()=>{const me=league.lb.find(l=>l.me);if(!me)return null;return (
        <div style={{background:"linear-gradient(135deg,rgba(55,255,99,.1),rgba(55,255,99,.06))",border:"1px solid rgba(55,255,99,.15)",borderRadius:16,padding:"14px 18px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:22}}>{me.av}</span>
            <div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.25)"}}>Your Rank</div>
              <div className="mono" style={{fontSize:24,fontWeight:800}}>#{me.rk}<span style={{fontSize:13,color:"rgba(255,255,255,.25)",fontWeight:500}}> / {league.members}</span></div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div className="mono" style={{fontSize:18,fontWeight:800,color:me.ret>=0?"#37ff63":"#ff285d"}}>{me.ret>=0?"+":""}{me.ret}%</div>
            <div className="mono" style={{fontSize:13,color:"rgba(255,255,255,.35)"}}>€{me.val.toLocaleString()}</div>
          </div>
        </div>
      );})()}

      {/* Podium */}
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {league.lb.slice(0,3).map((l,i)=>(
          <div key={l.rk} style={{flex:1,textAlign:"center",borderRadius:14,padding:"16px 6px",background:podBg[i],border:`1px solid ${l.me?"rgba(55,255,99,.25)":"rgba(255,255,255,.04)"}`}}>
            <div style={{fontSize:22}}>{medals[i]}</div>
            <div style={{fontSize:18,marginTop:4}}>{l.av}</div>
            <div style={{fontSize:13,fontWeight:700,marginTop:4}}>{l.nm}{l.me&&<span style={{fontSize:11,color:"#37ff63",display:"block"}}>(you)</span>}</div>
            <div className="mono" style={{fontSize:14,fontWeight:800,color:l.ret>=0?"#37ff63":"#ff285d",marginTop:4}}>{l.ret>0?"+":""}{l.ret}%</div>
          </div>
        ))}
      </div>

      {/* Rest */}
      <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:16,overflow:"hidden"}}>
        {league.lb.slice(3).map((l,i)=>(
          <div key={l.rk} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:i<league.lb.length-4?"1px solid rgba(255,255,255,.04)":"none",background:l.me?"rgba(55,255,99,.04)":"transparent"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span className="mono" style={{color:"rgba(255,255,255,.15)",fontSize:13,minWidth:24,fontWeight:700}}>#{l.rk}</span>
              <span style={{fontSize:16}}>{l.av}</span>
              <span style={{fontSize:13,fontWeight:l.me?700:500}}>{l.nm}{l.me?" (you)":""}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span className="mono" style={{fontSize:13,color:"rgba(255,255,255,.35)"}}>€{l.val.toLocaleString()}</span>
              <span className={"ch "+(l.ret>=0?"cu":"cn")}>{l.ret>=0?"+":""}{l.ret}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Invite CTA */}
      {!league.isPublic&&(
        <div style={{marginTop:14,background:"rgba(55,255,99,.06)",border:"1px solid rgba(55,255,99,.12)",borderRadius:14,padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:13,fontWeight:700}}>Invite more players</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.25)",marginTop:2}}>Share code <span className="mono" style={{color:"#37ff63",fontWeight:700}}>{league.code}</span></div>
          </div>
          <button style={{padding:"10px 18px",fontSize:13,fontWeight:700,borderRadius:10,background:"rgba(255,255,255,.08)",color:"#fff",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Share</button>
        </div>
      )}
    </div>
  );
}

/* ═══ PROFILE ═══ */
function ProfileTab({goTab}){
  const[name,setName]=useState("Alex M.");
  const[email,setEmail]=useState("alex@fundxi.io");
  const[favTeam,setFavTeam]=useState("FRA");
  const[favPlayer,setFavPlayer]=useState("Mbappé");
  const[editMode,setEditMode]=useState(false);
  const[showTeamPicker,setShowTeamPicker]=useState(false);
  const allTeamKeys=Object.keys(N);

  const stats={joined:"Jun 11, 2026",trades:47,winRate:"68%",bestTrade:"+12.4%",streak:"5 wins"};

  return (
    <div style={{padding:"0 20px 32px"}}>
      {/* Avatar + name */}
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
        <div style={{width:60,height:60,borderRadius:18,background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,color:"#fff",border:"2px solid rgba(55,255,99,.3)",flexShrink:0}}>{name.split(" ").map(w=>w[0]).join("")}</div>
        <div style={{flex:1}}>
          {editMode?(
            <input value={name} onChange={e=>setName(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:"8px 12px",color:"#fff",fontSize:17,fontWeight:700,fontFamily:"inherit",outline:"none"}}/>
          ):(
            <div style={{fontSize:20,fontWeight:800}}>{name}</div>
          )}
          <div style={{fontSize:13,color:"rgba(255,255,255,.25)",marginTop:3}}>{email}</div>
        </div>
        <button onClick={()=>setEditMode(!editMode)} style={{padding:"8px 16px",borderRadius:10,fontSize:13,fontWeight:600,border:"1px solid rgba(255,255,255,.06)",background:editMode?"rgba(55,255,99,.12)":"rgba(255,255,255,.04)",color:editMode?"#37ff63":"rgba(255,255,255,.35)",cursor:"pointer",fontFamily:"inherit"}}>{editMode?"Done":"Edit"}</button>
      </div>

      {/* Favorites */}
      <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:16,padding:"16px",marginBottom:20}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Favorites</div>
        <div style={{display:"flex",gap:10,marginBottom:10}}>
          <div onClick={()=>setShowTeamPicker(!showTeamPicker)} style={{flex:1,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:12,padding:"12px",cursor:"pointer"}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.25)",marginBottom:4}}>TEAM</div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:22}}>{N[favTeam]?.f}</span>
              <span style={{fontSize:14,fontWeight:700}}>{N[favTeam]?.n}</span>
            </div>
          </div>
          <div style={{flex:1,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:12,padding:"12px"}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.25)",marginBottom:4}}>PLAYER</div>
            <div style={{fontSize:14,fontWeight:700}}>⭐ {favPlayer}</div>
          </div>
        </div>
        {showTeamPicker&&(
          <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:12,padding:"10px",maxHeight:200,overflowY:"auto",marginTop:4}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {allTeamKeys.map(k=>{const nt=N[k];const on=favTeam===k;return (
                <button key={k} onClick={()=>{setFavTeam(k);setShowTeamPicker(false);}} style={{padding:"7px 12px",borderRadius:8,fontSize:12,fontWeight:on?700:500,border:on?"1px solid rgba(55,255,99,.3)":"1px solid rgba(255,255,255,.05)",background:on?"rgba(55,255,99,.15)":"rgba(255,255,255,.02)",color:on?"#37ff63":"rgba(255,255,255,.35)",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4,minHeight:36}}>
                  <span style={{fontSize:15}}>{nt.f}</span>{nt.n}
                </button>
              );})}
            </div>
          </div>
        )}
      </div>

      {/* Trading stats */}
      <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:16,padding:"16px",marginBottom:20}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Trading Stats</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {[{l:"Joined",v:stats.joined},{l:"Trades",v:stats.trades},{l:"Win Rate",v:stats.winRate,c:"#37ff63"},{l:"Best Trade",v:stats.bestTrade,c:"#37ff63"},{l:"Streak",v:stats.streak,c:"rgba(255,255,255,.5)"},{l:"Leagues",v:"4",c:"#37ff63"}].map((s,i)=>(
            <div key={i} style={{background:"rgba(255,255,255,.02)",borderRadius:10,padding:"10px",textAlign:"center"}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>{s.l}</div>
              <div className="mono" style={{fontSize:14,fontWeight:700,color:s.c||"#fff",marginTop:3}}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:16,overflow:"hidden",marginBottom:20}}>
        <div style={{fontSize:14,fontWeight:700,padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,.04)"}}>Settings</div>
        {[{icon:"🔔",l:"Notifications",v:"On"},{icon:"🌙",l:"Dark Mode",v:"Always"},{icon:"💱",l:"Currency",v:"EUR €"},{icon:"📊",l:"Default Chart Period",v:"30D"},{icon:"🔒",l:"Privacy",v:"Friends only"}].map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:i<4?"1px solid rgba(255,255,255,.04)":"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>{s.icon}</span>
              <span style={{fontSize:13,fontWeight:500}}>{s.l}</span>
            </div>
            <span style={{fontSize:13,color:"rgba(255,255,255,.25)"}}>{s.v} ▸</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <button onClick={()=>goTab("leaderboard")} style={{width:"100%",padding:"14px 0",fontSize:13,fontWeight:700,borderRadius:12,background:"rgba(55,255,99,.08)",color:"#37ff63",border:"1px solid rgba(55,255,99,.12)",cursor:"pointer",fontFamily:"inherit"}}>Manage Leagues</button>
        <button style={{width:"100%",padding:"14px 0",fontSize:13,fontWeight:600,borderRadius:12,background:"rgba(255,255,255,.03)",color:"rgba(255,255,255,.25)",border:"1px solid rgba(255,255,255,.04)",cursor:"pointer",fontFamily:"inherit"}}>Help & Support</button>
        <button style={{width:"100%",padding:"14px 0",fontSize:13,fontWeight:600,borderRadius:12,background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.35)",border:"1px solid rgba(255,255,255,.06)",cursor:"pointer",fontFamily:"inherit"}}>Log Out</button>
      </div>
    </div>
  );
}

/* ═══════ MAIN ═══════ */
export default function App(){
  const[tab,setTab]=useState("home");
  const[sel,setSel]=useState(null);
  const[match,setMatch]=useState(null);
  const[watchlist,setWatchlist]=useState(new Set([16,7,108,148])); // default starred: Yamal, Mbappé, Isak, Caicedo
  const toggleWatch=(id)=>{const s=new Set(watchlist);if(s.has(id))s.delete(id);else s.add(id);setWatchlist(s);};

  // Dynamic portfolio values
  const ptf=useMemo(()=>{
    const hld=MYPORT.map(h=>{const p=P.find(x=>x.id===h.pid);if(!p)return null;return{mv:p.v*h.sh,cb:h.ab*h.sh};}).filter(Boolean);
    const tv=hld.reduce((a,h)=>a+h.mv,0),tc=hld.reduce((a,h)=>a+h.cb,0);
    return{tv,pnl:tv-tc,ret:((tv-tc)/tc)*100};
  },[]);

  const tabs=[{id:"home",l:"Home",i:"◆"},{id:"screener",l:"Screener",i:"◎"},{id:"fixtures",l:"Fixtures",i:"⬡"},{id:"portfolio",l:"Portfolio",i:"◈"},{id:"leaderboard",l:"Leagues",i:"▲"}];
  const goTab=id=>{setTab(id);setMatch(null);};

  let content;
  if(match) content=<MatchView match={match} onBack={()=>setMatch(null)} onPlayer={p=>setSel(p)} goPortfolio={()=>{setMatch(null);setTab("portfolio");}}/>;
  else if(tab==="home") content=<HomeTab onPlayer={setSel} goTab={goTab} openMatch={setMatch} ptf={ptf} watchlist={watchlist} toggleWatch={toggleWatch}/>;
  else if(tab==="screener") content=<ScreenerTab onPlayer={setSel} watchlist={watchlist} toggleWatch={toggleWatch}/>;
  else if(tab==="fixtures") content=<FixturesTab openMatch={setMatch}/>;
  else if(tab==="portfolio") content=<PortfolioTab onPlayer={setSel}/>;
  else if(tab==="profile") content=<ProfileTab goTab={goTab}/>;
  else content=<LeaderboardTab/>;

  return (
    <div style={{minHeight:"100vh",maxWidth:430,margin:"0 auto",background:"#020406",color:"#fff",fontFamily:"'Inter',sans-serif",position:"relative",overflowX:"hidden"}}>
      <style>{CSS}</style>
      {/* Pure Cyan ambient glow */}
      <div style={{position:"fixed",inset:0,background:"radial-gradient(ellipse 120% 80% at 10% 5%, #152a42, #0a1520 35%, #040810 55%, #020406 100%)",pointerEvents:"none",zIndex:0}}/>
      <header style={{position:"sticky",top:0,zIndex:100,padding:"0 16px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(2,4,6,.9)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}} onClick={()=>goTab("home")}>
          <div className="mono" style={{width:24,height:24,borderRadius:6,background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff"}}>XI</div>
          <span style={{fontSize:14,fontWeight:700}}>FundXI</span>
          <span style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.4)",background:"rgba(255,255,255,.06)",padding:"2px 5px",borderRadius:4}}>WC 2026</span>
        </div>
        <div onClick={()=>goTab("profile")} style={{width:30,height:30,borderRadius:10,background:"rgba(255,255,255,.05)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"rgba(255,255,255,.5)",cursor:"pointer",border:tab==="profile"?"2px solid rgba(255,255,255,.2)":"2px solid transparent",transition:"all .2s"}}>A</div>
      </header>
      {/* Portfolio bar — always visible under header */}
      <div onClick={()=>goTab("portfolio")} style={{position:"sticky",top:54,zIndex:99,background:"rgba(2,4,6,.85)",backdropFilter:"blur(16px)",borderBottom:"1px solid rgba(255,255,255,.04)",padding:"6px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:4,height:4,borderRadius:2,background:ptf.pnl>=0?"#37ff63":"#ff285d",boxShadow:`0 0 6px ${ptf.pnl>=0?"rgba(55,255,99,.4)":"rgba(255,40,93,.4)"}`}}/>
          <span className="mono" style={{fontSize:12,fontWeight:800}}>€{(ptf.tv/1000).toFixed(1)}k</span>
          <span className="mono" style={{fontSize:12,fontWeight:700,color:ptf.ret>=0?"#37ff63":"#ff285d"}}>{ptf.ret>=0?"+":""}{ptf.ret.toFixed(1)}%</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span className="mono" style={{fontSize:11,color:ptf.pnl>=0?"#37ff63":"#ff285d",fontWeight:600}}>P&L {ptf.pnl>=0?"+":""}€{(ptf.pnl/1000).toFixed(1)}k</span>
          <span style={{fontSize:11,color:"rgba(255,255,255,.2)"}}>◈</span>
        </div>
      </div>
      {!match&&<div style={{padding:"10px 16px 4px"}}><h1 style={{fontSize:20,fontWeight:800,letterSpacing:-.5}}>{tab==="profile"?"Profile":tabs.find(t=>t.id===tab)?.l||""}</h1></div>}
      {match
        ? <div style={{position:"relative",zIndex:1,height:"calc(100vh - 48px - 30px - 52px)",overflow:"hidden"}}>{content}</div>
        : <div style={{position:"relative",zIndex:1,paddingBottom:82}}>{content}</div>
      }
      {sel&&<PlayerSheet player={sel} onClose={()=>setSel(null)} goPortfolio={()=>{setSel(null);setMatch(null);setTab("portfolio");}} watchlist={watchlist} toggleWatch={toggleWatch}/>}
      {!sel&&!match&&<nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,zIndex:150,background:"rgba(2,4,6,.92)",backdropFilter:"blur(24px)",borderTop:"1px solid rgba(255,255,255,.04)",display:"flex",justifyContent:"space-around",alignItems:"center",paddingTop:8,paddingBottom:"max(8px,env(safe-area-inset-bottom))"}}>
        {tabs.map(t=>(<button key={t.id} onClick={()=>goTab(t.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"transparent",border:"none",cursor:"pointer",padding:"6px 12px",minWidth:52}}>
          <span style={{fontSize:18,opacity:tab===t.id&&!match?1:.25,transform:tab===t.id&&!match?"scale(1.15)":"scale(1)",transition:"all .2s"}}>{t.i}</span>
          <span style={{fontSize:11,fontWeight:600,color:tab===t.id&&!match?"#fff":"rgba(255,255,255,.25)"}}>{t.l}</span>
          {tab===t.id&&!match&&<div style={{width:5,height:5,borderRadius:3,background:"#fff",boxShadow:"0 0 6px rgba(255,255,255,.3)"}}/>}
        </button>))}
      </nav>}
    </div>
  );
}
