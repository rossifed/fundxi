import type { Player } from "@/domain/player/player";

const PLAYERS: Player[] = [
{id:1,name:"Messi",full_name:"Lionel Messi",jersey_number:10,team_id:"ARG",position:"FW",tags:["Vision","Finishing","Dribbling","Free Kicks","Playmaking"],age:38,foot:"Left",height:"170cm",weight:"72kg",club:"Inter Miami",bio:"The greatest of all time entering his final World Cup. Eight Ballon d'Or winner, 2022 World Cup champion."},
{id:2,name:"J. Álvarez",full_name:"Julián Álvarez",jersey_number:9,team_id:"ARG",position:"FW",tags:["Pressing","Finishing","Work Rate","Movement"],age:26,foot:"Right",height:"170cm",weight:"71kg",club:"Atlético Madrid",bio:"Tireless forward combining relentless pressing with clinical finishing."},
{id:3,name:"Mac Allister",full_name:"Alexis Mac Allister",jersey_number:20,team_id:"ARG",position:"MF",tags:["Passing","Vision","Ball Control","Composure"],age:27,foot:"Right",height:"176cm",weight:"72kg",club:"Liverpool",bio:"Elegant midfielder who controls the tempo."},
{id:4,name:"Vinícius Jr",full_name:"Vinícius Júnior",jersey_number:7,team_id:"BRA",position:"FW",tags:["Pace","Dribbling","Flair","1v1","Acceleration"],age:25,foot:"Right",height:"176cm",weight:"73kg",club:"Real Madrid",bio:"Explosive winger. Ballon d'Or winner and Brazil's biggest threat."},
{id:5,name:"Rodrygo",full_name:"Rodrygo",jersey_number:11,team_id:"BRA",position:"FW",tags:["Dribbling","Finishing","Versatility"],age:25,foot:"Right",height:"174cm",weight:"64kg",club:"Real Madrid",bio:"Versatile attacker with ice-cold composure."},
{id:6,name:"Endrick",full_name:"Endrick Felipe",jersey_number:21,team_id:"BRA",position:"FW",tags:["Pace","Power","Youth","Finishing"],age:19,foot:"Left",height:"173cm",weight:"72kg",club:"Real Madrid",bio:"Teenage sensation making his World Cup debut."},
{id:7,name:"Mbappé",full_name:"Kylian Mbappé",jersey_number:10,team_id:"FRA",position:"FW",tags:["Pace","Finishing","Dribbling","Movement","Leadership"],age:27,foot:"Right",height:"178cm",weight:"73kg",club:"Real Madrid",bio:"France's captain and the fastest player in world football."},
{id:8,name:"Dembélé",full_name:"Ousmane Dembélé",jersey_number:11,team_id:"FRA",position:"FW",tags:["Pace","Dribbling","Both Feet","Crossing"],age:29,foot:"Both",height:"178cm",weight:"67kg",club:"PSG",bio:"Unpredictable winger equally dangerous on either foot."},
{id:9,name:"Barcola",full_name:"Bradley Barcola",jersey_number:29,team_id:"FRA",position:"FW",tags:["Pace","Dribbling","Youth","Direct"],age:22,foot:"Left",height:"186cm",weight:"72kg",club:"PSG",bio:"Young French sensation with silky dribbling."},
{id:10,name:"Camavinga",full_name:"Eduardo Camavinga",jersey_number:12,team_id:"FRA",position:"MF",tags:["Recovery","Pressing","Dribbling","Versatility"],age:23,foot:"Left",height:"182cm",weight:"68kg",club:"Real Madrid",bio:"Dynamic midfielder combining intensity with elegance."},
{id:11,name:"Tchouaméni",full_name:"Aurélien Tchouaméni",jersey_number:8,team_id:"FRA",position:"MF",tags:["Tackling","Passing","Long Range","Positioning"],age:26,foot:"Right",height:"187cm",weight:"81kg",club:"Real Madrid",bio:"Complete defensive midfielder with tactical intelligence."},
{id:51,name:"Saliba",full_name:"William Saliba",jersey_number:2,team_id:"FRA",position:"DF",tags:["Composure","Tackling","Ball Playing","Aerial"],age:25,foot:"Right",height:"192cm",weight:"82kg",club:"Arsenal",bio:"Rock-solid centre-back."},
{id:60,name:"Upamecano",full_name:"Dayot Upamecano",jersey_number:4,team_id:"FRA",position:"DF",tags:["Pace","Aerial","Strength"],age:27,foot:"Right",height:"186cm",weight:"80kg",club:"Bayern Munich",bio:"Powerful centre-back."},
{id:61,name:"T. Hernández",full_name:"Theo Hernández",jersey_number:22,team_id:"FRA",position:"DF",tags:["Overlapping","Crossing","Pace"],age:28,foot:"Left",height:"184cm",weight:"81kg",club:"AC Milan",bio:"Marauding left-back."},
{id:62,name:"Koundé",full_name:"Jules Koundé",jersey_number:5,team_id:"FRA",position:"DF",tags:["Ball Playing","Pace","Intelligence"],age:27,foot:"Right",height:"180cm",weight:"75kg",club:"FC Barcelona",bio:"Modern full-back."},
{id:63,name:"Maignan",full_name:"Mike Maignan",jersey_number:1,team_id:"FRA",position:"GK",tags:["Reflexes","Distribution","Command"],age:31,foot:"Right",height:"191cm",weight:"85kg",club:"AC Milan",bio:"France's commanding number one."},
{id:12,name:"Bellingham",full_name:"Jude Bellingham",jersey_number:10,team_id:"ENG",position:"MF",tags:["Box-to-Box","Finishing","Leadership","Aerial","Driving Runs"],age:22,foot:"Right",height:"186cm",weight:"75kg",club:"Real Madrid",bio:"England's generational talent."},
{id:13,name:"Saka",full_name:"Bukayo Saka",jersey_number:7,team_id:"ENG",position:"FW",tags:["Dribbling","Crossing","Finishing","Intelligence"],age:24,foot:"Left",height:"178cm",weight:"72kg",club:"Arsenal",bio:"England's most consistent attacker."},
{id:14,name:"Rice",full_name:"Declan Rice",jersey_number:4,team_id:"ENG",position:"MF",tags:["Recovery","Passing","Leadership","Carrying"],age:27,foot:"Right",height:"185cm",weight:"80kg",club:"Arsenal",bio:"England's midfield anchor."},
{id:15,name:"Foden",full_name:"Phil Foden",jersey_number:11,team_id:"ENG",position:"MF",tags:["Vision","Dribbling","Finishing","Technique"],age:26,foot:"Left",height:"171cm",weight:"69kg",club:"Manchester City",bio:"The Stockport Iniesta."},
{id:16,name:"Yamal",full_name:"Lamine Yamal",jersey_number:19,team_id:"ESP",position:"FW",tags:["Dribbling","Vision","Pace","Creativity","Youth"],age:18,foot:"Left",height:"180cm",weight:"68kg",club:"FC Barcelona",bio:"The youngest star in world football."},
{id:17,name:"Pedri",full_name:"Pedri",jersey_number:8,team_id:"ESP",position:"MF",tags:["Vision","Ball Control","Passing","Composure"],age:23,foot:"Right",height:"174cm",weight:"63kg",club:"FC Barcelona",bio:"Spain's metronome."},
{id:18,name:"Rodri",full_name:"Rodri",jersey_number:6,team_id:"ESP",position:"MF",tags:["Positioning","Composure","Passing","Tackling"],age:30,foot:"Right",height:"191cm",weight:"82kg",club:"Manchester City",bio:"Ballon d'Or winner 2024."},
{id:20,name:"Musiala",full_name:"Jamal Musiala",jersey_number:10,team_id:"GER",position:"MF",tags:["Dribbling","Vision","Close Control","Agility"],age:23,foot:"Right",height:"183cm",weight:"72kg",club:"Bayern Munich",bio:"Germany's dazzling playmaker."},
{id:21,name:"Wirtz",full_name:"Florian Wirtz",jersey_number:17,team_id:"GER",position:"MF",tags:["Creativity","Finishing","Through Balls"],age:23,foot:"Right",height:"176cm",weight:"70kg",club:"Bayer Leverkusen",bio:"Leverkusen's invincible architect."},
{id:26,name:"Haaland",full_name:"Erling Haaland",jersey_number:9,team_id:"NOR",position:"FW",tags:["Finishing","Strength","Pace","Aerial"],age:25,foot:"Left",height:"194cm",weight:"88kg",club:"Manchester City",bio:"A goalscoring machine."},
{id:27,name:"Ødegaard",full_name:"Martin Ødegaard",jersey_number:8,team_id:"NOR",position:"MF",tags:["Vision","Creativity","Passing","Set Pieces"],age:27,foot:"Left",height:"178cm",weight:"68kg",club:"Arsenal",bio:"Norway's creative heartbeat."},
{id:32,name:"Hakimi",full_name:"Achraf Hakimi",jersey_number:2,team_id:"MAR",position:"DF",tags:["Pace","Overlapping","Stamina"],age:27,foot:"Right",height:"181cm",weight:"73kg",club:"PSG",bio:"The fastest full-back."},
{id:36,name:"Son",full_name:"Son Heung-min",jersey_number:7,team_id:"KOR",position:"FW",tags:["Finishing","Pace","Both Feet"],age:33,foot:"Both",height:"183cm",weight:"78kg",club:"Tottenham",bio:"South Korea's all-time top scorer."},
{id:37,name:"Kim",full_name:"Kim Min-jae",jersey_number:3,team_id:"KOR",position:"DF",tags:["Tackling","Aerial","Pace"],age:29,foot:"Right",height:"190cm",weight:"88kg",club:"Bayern Munich",bio:"Asia's best defender."},
{id:38,name:"Salah",full_name:"Mohamed Salah",jersey_number:10,team_id:"EGY",position:"FW",tags:["Finishing","Dribbling","Pace"],age:33,foot:"Left",height:"175cm",weight:"71kg",club:"Liverpool",bio:"The Egyptian King."},
{id:39,name:"Marmoush",full_name:"Omar Marmoush",jersey_number:22,team_id:"EGY",position:"FW",tags:["Pace","Pressing","Finishing"],age:25,foot:"Right",height:"183cm",weight:"75kg",club:"Manchester City",bio:"Egypt's breakout star."},
{id:40,name:"Pulisic",full_name:"Christian Pulisic",jersey_number:10,team_id:"USA",position:"MF",tags:["Dribbling","Creativity","Versatility"],age:27,foot:"Right",height:"177cm",weight:"73kg",club:"AC Milan",bio:"Captain America."},
{id:42,name:"Valverde",full_name:"Federico Valverde",jersey_number:15,team_id:"URU",position:"MF",tags:["Long Shots","Stamina","Box-to-Box"],age:27,foot:"Right",height:"182cm",weight:"78kg",club:"Real Madrid",bio:"An engine that never stops."},
{id:43,name:"D. Núñez",full_name:"Darwin Núñez",jersey_number:9,team_id:"URU",position:"FW",tags:["Pace","Heading","Chaos"],age:27,foot:"Right",height:"187cm",weight:"81kg",club:"Liverpool",bio:"Unpredictable and explosive."},
{id:44,name:"Araújo",full_name:"Ronald Araújo",jersey_number:4,team_id:"URU",position:"DF",tags:["Aerial","Tackling","Pace"],age:27,foot:"Right",height:"188cm",weight:"84kg",club:"FC Barcelona",bio:"One of the fastest centre-backs."},
{id:45,name:"De Bruyne",full_name:"Kevin De Bruyne",jersey_number:7,team_id:"BEL",position:"MF",tags:["Vision","Long Passing","Shooting"],age:35,foot:"Right",height:"181cm",weight:"68kg",club:"Manchester City",bio:"Belgium's maestro."},
{id:47,name:"L. Díaz",full_name:"Luis Díaz",jersey_number:7,team_id:"COL",position:"FW",tags:["Dribbling","Pressing","Pace"],age:29,foot:"Right",height:"178cm",weight:"65kg",club:"Liverpool",bio:"Colombia's electric winger."},
{id:48,name:"J. David",full_name:"Jonathan David",jersey_number:20,team_id:"CAN",position:"FW",tags:["Finishing","Movement"],age:26,foot:"Right",height:"180cm",weight:"74kg",club:"Arsenal",bio:"Canada's talisman."},
{id:49,name:"A. Davies",full_name:"Alphonso Davies",jersey_number:19,team_id:"CAN",position:"DF",tags:["Pace","Overlapping","Dribbling"],age:25,foot:"Left",height:"183cm",weight:"76kg",club:"Real Madrid",bio:"The fastest left-back on the planet."},
{id:50,name:"Kudus",full_name:"Mohammed Kudus",jersey_number:10,team_id:"GHA",position:"MF",tags:["Dribbling","Long Shots","Skill"],age:25,foot:"Right",height:"177cm",weight:"70kg",club:"West Ham",bio:"Ghana's most exciting talent."},
{id:31,name:"Gvardiol",full_name:"Joško Gvardiol",jersey_number:24,team_id:"CRO",position:"DF",tags:["Ball Playing","Tackling"],age:24,foot:"Left",height:"185cm",weight:"82kg",club:"Manchester City",bio:"Modern ball-playing centre-back."},
{id:53,name:"Alisson",full_name:"Alisson Becker",jersey_number:1,team_id:"BRA",position:"GK",tags:["Distribution","Reflexes"],age:33,foot:"Right",height:"193cm",weight:"91kg",club:"Liverpool",bio:"The complete goalkeeper."},
{id:25,name:"Leão",full_name:"Rafael Leão",jersey_number:17,team_id:"POR",position:"FW",tags:["Pace","Dribbling","Flair"],age:27,foot:"Left",height:"188cm",weight:"81kg",club:"AC Milan",bio:"Portugal's lightning bolt."},
{id:23,name:"Ronaldo",full_name:"Cristiano Ronaldo",jersey_number:7,team_id:"POR",position:"FW",tags:["Finishing","Aerial","Leadership"],age:41,foot:"Right",height:"187cm",weight:"85kg",club:"Al Nassr",bio:"All-time international top scorer at his final World Cup."},
{id:24,name:"Bruno F.",full_name:"Bruno Fernandes",jersey_number:8,team_id:"POR",position:"MF",tags:["Vision","Long Shots","Set Pieces"],age:31,foot:"Right",height:"179cm",weight:"69kg",club:"Manchester United",bio:"Portugal's creative engine."},
{id:28,name:"Gakpo",full_name:"Cody Gakpo",jersey_number:11,team_id:"NED",position:"FW",tags:["Finishing","Pace","Aerial"],age:25,foot:"Right",height:"189cm",weight:"82kg",club:"Liverpool",bio:"Netherlands' most dangerous attacker."},
{id:52,name:"Van Dijk",full_name:"Virgil van Dijk",jersey_number:4,team_id:"NED",position:"DF",tags:["Aerial","Leadership","Composure"],age:34,foot:"Right",height:"193cm",weight:"92kg",club:"Liverpool",bio:"The Dutch colossus."},
{id:54,name:"Courtois",full_name:"Thibaut Courtois",jersey_number:1,team_id:"BEL",position:"GK",tags:["Shot Stopping","Reflexes"],age:34,foot:"Left",height:"199cm",weight:"96kg",club:"Real Madrid",bio:"A wall between the posts."},
// ── Missing teams: 2 players each ──
// Switzerland
{id:100,name:"Xhaka",full_name:"Granit Xhaka",jersey_number:10,team_id:"SUI",position:"MF",tags:["Leadership","Passing","Long Range"],age:33,foot:"Left",height:"185cm",weight:"82kg",club:"Bayer Leverkusen",bio:"Switzerland's captain and midfield general."},
{id:101,name:"Akanji",full_name:"Manuel Akanji",jersey_number:5,team_id:"SUI",position:"DF",tags:["Ball Playing","Composure"],age:29,foot:"Right",height:"187cm",weight:"85kg",club:"Manchester City",bio:"Elite centre-back with a Treble winner's mentality."},
// Austria
{id:102,name:"Sabitzer",full_name:"Marcel Sabitzer",jersey_number:7,team_id:"AUT",position:"MF",tags:["Box-to-Box","Long Shots"],age:32,foot:"Right",height:"178cm",weight:"72kg",club:"Borussia Dortmund",bio:"Austria's tireless engine."},
{id:103,name:"Laimer",full_name:"Konrad Laimer",jersey_number:8,team_id:"AUT",position:"MF",tags:["Pressing","Stamina"],age:27,foot:"Right",height:"180cm",weight:"75kg",club:"Bayern Munich",bio:"Relentless pressing machine."},
// Scotland
{id:104,name:"McTominay",full_name:"Scott McTominay",jersey_number:8,team_id:"SCO",position:"MF",tags:["Aerial","Box-to-Box","Finishing"],age:29,foot:"Right",height:"191cm",weight:"84kg",club:"Napoli",bio:"Scotland's midfield goal threat."},
{id:105,name:"Robertson",full_name:"Andrew Robertson",jersey_number:3,team_id:"SCO",position:"DF",tags:["Crossing","Overlapping","Leadership"],age:32,foot:"Left",height:"178cm",weight:"72kg",club:"Liverpool",bio:"Scotland's captain and world-class left-back."},
// Italy
{id:106,name:"Donnarumma",full_name:"Gianluigi Donnarumma",jersey_number:1,team_id:"ITA",position:"GK",tags:["Reflexes","1v1","Command"],age:27,foot:"Right",height:"196cm",weight:"90kg",club:"PSG",bio:"Italy's towering goalkeeper."},
{id:107,name:"Barella",full_name:"Nicolò Barella",jersey_number:18,team_id:"ITA",position:"MF",tags:["Box-to-Box","Long Shots","Passing"],age:29,foot:"Right",height:"172cm",weight:"68kg",club:"Inter Milan",bio:"Italy's most complete midfielder."},
// Sweden
{id:108,name:"Isak",full_name:"Alexander Isak",jersey_number:11,team_id:"SWE",position:"FW",tags:["Finishing","Dribbling","Pace"],age:26,foot:"Right",height:"190cm",weight:"80kg",club:"Newcastle",bio:"Sweden's elegant striker."},
{id:109,name:"Kulusevski",full_name:"Dejan Kulusevski",jersey_number:21,team_id:"SWE",position:"FW",tags:["Dribbling","Vision","Versatility"],age:26,foot:"Left",height:"186cm",weight:"78kg",club:"Tottenham",bio:"Dynamic attacker who can play anywhere in the front line."},
// Türkiye
{id:110,name:"Çalhanoğlu",full_name:"Hakan Çalhanoğlu",jersey_number:10,team_id:"TUR",position:"MF",tags:["Free Kicks","Passing","Long Range"],age:32,foot:"Right",height:"178cm",weight:"74kg",club:"Inter Milan",bio:"Türkiye's dead-ball specialist and midfield conductor."},
{id:111,name:"Yıldız",full_name:"Kenan Yıldız",jersey_number:18,team_id:"TUR",position:"FW",tags:["Dribbling","Youth","Creativity"],age:21,foot:"Right",height:"184cm",weight:"72kg",club:"Juventus",bio:"Türkiye's rising star."},
// Denmark
{id:112,name:"Eriksen",full_name:"Christian Eriksen",jersey_number:10,team_id:"DEN",position:"MF",tags:["Vision","Set Pieces","Passing"],age:34,foot:"Right",height:"182cm",weight:"76kg",club:"Manchester United",bio:"Denmark's creative heart — an inspirational comeback story."},
{id:113,name:"Højlund",full_name:"Rasmus Højlund",jersey_number:9,team_id:"DEN",position:"FW",tags:["Pace","Finishing","Power"],age:23,foot:"Right",height:"191cm",weight:"84kg",club:"Manchester United",bio:"Denmark's young powerhouse striker."},
// Mexico
{id:114,name:"Lozano",full_name:"Hirving Lozano",jersey_number:22,team_id:"MEX",position:"FW",tags:["Pace","Dribbling","Direct"],age:30,foot:"Right",height:"175cm",weight:"70kg",club:"PSV",bio:"El Chucky — Mexico's explosive winger."},
{id:115,name:"Edson Álvarez",full_name:"Edson Álvarez",jersey_number:4,team_id:"MEX",position:"MF",tags:["Tackling","Aerial","Leadership"],age:28,foot:"Right",height:"187cm",weight:"80kg",club:"West Ham",bio:"Mexico's midfield destroyer."},
// Panama
{id:116,name:"Fajardo",full_name:"José Fajardo",jersey_number:9,team_id:"PAN",position:"FW",tags:["Finishing","Movement"],age:26,foot:"Right",height:"180cm",weight:"75kg",club:"Saprissa",bio:"Panama's leading striker."},
{id:117,name:"Godoy",full_name:"Adalberto Carrasquilla",jersey_number:10,team_id:"PAN",position:"MF",tags:["Creativity","Passing"],age:27,foot:"Right",height:"168cm",weight:"62kg",club:"Houston Dynamo",bio:"Panama's playmaker."},
// Curaçao
{id:118,name:"Bacuna",full_name:"Leandro Bacuna",jersey_number:7,team_id:"CUR",position:"MF",tags:["Versatility","Long Shots"],age:33,foot:"Right",height:"185cm",weight:"78kg",club:"Cardiff City",bio:"Curaçao's talisman at their first World Cup."},
{id:119,name:"Hato",full_name:"Juninho Bacuna",jersey_number:11,team_id:"CUR",position:"FW",tags:["Pace","Dribbling"],age:29,foot:"Right",height:"176cm",weight:"71kg",club:"Birmingham City",bio:"Key attacker for the smallest WC nation ever."},
// Haiti
{id:120,name:"Nazon",full_name:"Duckens Nazon",jersey_number:9,team_id:"HAI",position:"FW",tags:["Finishing","Poaching"],age:30,foot:"Right",height:"176cm",weight:"72kg",club:"Championnat National",bio:"Haiti's all-time World Cup qualifying top scorer."},
{id:121,name:"Duverger",full_name:"Steeven Duverger",jersey_number:1,team_id:"HAI",position:"GK",tags:["Reflexes","Command"],age:28,foot:"Right",height:"188cm",weight:"82kg",club:"Guingamp",bio:"Haiti's safe pair of hands."},
// Japan
{id:122,name:"Mitoma",full_name:"Kaoru Mitoma",jersey_number:7,team_id:"JPN",position:"FW",tags:["Dribbling","Pace","Intelligence"],age:29,foot:"Left",height:"178cm",weight:"72kg",club:"Brighton",bio:"Japan's dazzling dribbler."},
{id:123,name:"Kamada",full_name:"Daichi Kamada",jersey_number:8,team_id:"JPN",position:"MF",tags:["Creativity","Through Balls"],age:28,foot:"Right",height:"180cm",weight:"76kg",club:"Crystal Palace",bio:"Japan's creative force in midfield."},
// Iran
{id:124,name:"Taremi",full_name:"Mehdi Taremi",jersey_number:9,team_id:"IRN",position:"FW",tags:["Finishing","Aerial","Hold-up"],age:32,foot:"Right",height:"187cm",weight:"82kg",club:"Inter Milan",bio:"Iran's prolific all-time scorer."},
{id:125,name:"Azmoun",full_name:"Sardar Azmoun",jersey_number:20,team_id:"IRN",position:"FW",tags:["Pace","Movement","Finishing"],age:31,foot:"Right",height:"186cm",weight:"80kg",club:"Roma",bio:"The Iranian Messi."},
// Australia
{id:126,name:"Arzani",full_name:"Daniel Arzani",jersey_number:11,team_id:"AUS",position:"FW",tags:["Dribbling","Pace","Youth"],age:27,foot:"Left",height:"170cm",weight:"62kg",club:"Macarthur FC",bio:"Australia's flashiest attacker."},
{id:127,name:"Souttar",full_name:"Harry Souttar",jersey_number:6,team_id:"AUS",position:"DF",tags:["Aerial","Tackling","Height"],age:26,foot:"Right",height:"198cm",weight:"92kg",club:"Leicester City",bio:"Australia's giant centre-back."},
// Saudi Arabia
{id:128,name:"Al-Dawsari",full_name:"Salem Al-Dawsari",jersey_number:10,team_id:"KSA",position:"FW",tags:["Free Kicks","Finishing"],age:33,foot:"Left",height:"172cm",weight:"67kg",club:"Al-Hilal",bio:"Saudi legend who scored THAT goal against Argentina."},
{id:129,name:"Kanno",full_name:"Mohamed Kanno",jersey_number:8,team_id:"KSA",position:"MF",tags:["Box-to-Box","Stamina"],age:30,foot:"Right",height:"188cm",weight:"80kg",club:"Al-Hilal",bio:"Saudi Arabia's midfield powerhouse."},
// Qatar
{id:130,name:"Afif",full_name:"Akram Afif",jersey_number:11,team_id:"QAT",position:"FW",tags:["Dribbling","Creativity","Set Pieces"],age:27,foot:"Left",height:"177cm",weight:"68kg",club:"Al Sadd",bio:"Asian Player of the Year 2024."},
{id:131,name:"Haidos",full_name:"Hassan Al-Haydos",jersey_number:10,team_id:"QAT",position:"MF",tags:["Leadership","Vision"],age:34,foot:"Right",height:"168cm",weight:"65kg",club:"Al Sadd",bio:"Qatar's all-time cap record holder."},
// Uzbekistan
{id:132,name:"Shomurodov",full_name:"Eldor Shomurodov",jersey_number:9,team_id:"UZB",position:"FW",tags:["Finishing","Pace"],age:29,foot:"Right",height:"189cm",weight:"82kg",club:"Roma",bio:"Uzbekistan's first-ever World Cup star."},
{id:133,name:"Khamrobekov",full_name:"Abdukodir Khusanov",jersey_number:4,team_id:"UZB",position:"DF",tags:["Tackling","Aerial","Youth"],age:21,foot:"Right",height:"186cm",weight:"82kg",club:"Manchester City",bio:"Breakout Uzbek defender signed by City."},
// Jordan
{id:134,name:"Al-Tamari",full_name:"Mousa Al-Tamari",jersey_number:7,team_id:"JOR",position:"FW",tags:["Dribbling","Pace"],age:28,foot:"Left",height:"171cm",weight:"65kg",club:"Montpellier",bio:"Jordan's star at their first-ever World Cup."},
{id:135,name:"Yasin",full_name:"Yazan Al-Naimat",jersey_number:9,team_id:"JOR",position:"FW",tags:["Finishing","Movement"],age:25,foot:"Right",height:"183cm",weight:"77kg",club:"Young Boys",bio:"Jordan's young striker."},
// Senegal
{id:136,name:"Koulibaly",full_name:"Kalidou Koulibaly",jersey_number:3,team_id:"SEN",position:"DF",tags:["Tackling","Aerial","Leadership"],age:35,foot:"Right",height:"186cm",weight:"89kg",club:"Al-Hilal",bio:"Senegal's defensive rock."},
{id:137,name:"Diallo",full_name:"Abdallah Sima",jersey_number:9,team_id:"SEN",position:"FW",tags:["Pace","Finishing","Direct"],age:25,foot:"Right",height:"183cm",weight:"75kg",club:"Brighton",bio:"Senegal's explosive young forward."},
// Algeria
{id:138,name:"Mahrez",full_name:"Riyad Mahrez",jersey_number:7,team_id:"ALG",position:"FW",tags:["Dribbling","Cutting Inside","Free Kicks"],age:35,foot:"Left",height:"179cm",weight:"67kg",club:"Al-Ahli",bio:"Algeria's most talented player of his generation."},
{id:139,name:"Bennacer",full_name:"Ismaël Bennacer",jersey_number:8,team_id:"ALG",position:"MF",tags:["Passing","Press Resistance","Composure"],age:28,foot:"Left",height:"175cm",weight:"70kg",club:"AC Milan",bio:"Algeria's metronome in midfield."},
// Tunisia
{id:140,name:"Khazri",full_name:"Wahbi Khazri",jersey_number:10,team_id:"TUN",position:"FW",tags:["Set Pieces","Creativity"],age:35,foot:"Right",height:"183cm",weight:"80kg",club:"Montpellier",bio:"Tunisia's experienced talisman."},
{id:141,name:"Skhiri",full_name:"Ellyes Skhiri",jersey_number:8,team_id:"TUN",position:"MF",tags:["Box-to-Box","Tackling","Stamina"],age:30,foot:"Right",height:"185cm",weight:"78kg",club:"PSG",bio:"Tunisia's midfield engine."},
// South Africa
{id:142,name:"Tau",full_name:"Percy Tau",jersey_number:11,team_id:"RSA",position:"FW",tags:["Pace","Dribbling"],age:32,foot:"Right",height:"172cm",weight:"66kg",club:"Al Ahly",bio:"Bafana Bafana's trickiest attacker."},
{id:143,name:"Mokoena",full_name:"Teboho Mokoena",jersey_number:8,team_id:"RSA",position:"MF",tags:["Long Shots","Passing"],age:27,foot:"Right",height:"179cm",weight:"72kg",club:"Mamelodi Sundowns",bio:"South Africa's rising midfield star."},
// Ivory Coast
{id:144,name:"Kessié",full_name:"Franck Kessié",jersey_number:8,team_id:"CIV",position:"MF",tags:["Power","Box-to-Box","Tackling"],age:29,foot:"Right",height:"183cm",weight:"85kg",club:"Al-Ahli",bio:"Ivory Coast's midfield tank."},
{id:145,name:"Haller",full_name:"Sébastien Haller",jersey_number:9,team_id:"CIV",position:"FW",tags:["Aerial","Finishing","Hold-up"],age:32,foot:"Right",height:"190cm",weight:"83kg",club:"Dortmund",bio:"Remarkable comeback story — cancer survivor turned AFCON champion."},
// Cape Verde
{id:146,name:"G. Rodrigues",full_name:"Garry Rodrigues",jersey_number:10,team_id:"CPV",position:"FW",tags:["Pace","Dribbling"],age:34,foot:"Right",height:"180cm",weight:"72kg",club:"Olympiacos",bio:"Cape Verde's talisman at their maiden World Cup."},
{id:147,name:"R. Lopes",full_name:"Roberto Lopes",jersey_number:4,team_id:"CPV",position:"DF",tags:["Aerial","Leadership"],age:31,foot:"Right",height:"188cm",weight:"82kg",club:"Shamrock Rovers",bio:"Irish-born Cape Verde hero."},
// Ecuador
{id:148,name:"Caicedo",full_name:"Moisés Caicedo",jersey_number:23,team_id:"ECU",position:"MF",tags:["Tackling","Box-to-Box","Carrying"],age:24,foot:"Right",height:"178cm",weight:"74kg",club:"Chelsea",bio:"Ecuador's world-class midfield destroyer."},
{id:149,name:"Sarmiento",full_name:"Jeremy Sarmiento",jersey_number:11,team_id:"ECU",position:"FW",tags:["Dribbling","Pace","Youth"],age:22,foot:"Left",height:"178cm",weight:"70kg",club:"Ipswich Town",bio:"Young Ecuadorian winger with flair."},
// Paraguay
{id:150,name:"Almirón",full_name:"Miguel Almirón",jersey_number:10,team_id:"PAR",position:"MF",tags:["Pace","Dribbling","Work Rate"],age:32,foot:"Right",height:"174cm",weight:"68kg",club:"Newcastle",bio:"Paraguay's hardest-working attacker."},
{id:151,name:"Gómez",full_name:"Julio Enciso",jersey_number:9,team_id:"PAR",position:"FW",tags:["Finishing","Youth","Flair"],age:21,foot:"Left",height:"172cm",weight:"64kg",club:"Brighton",bio:"Paraguay's teenage sensation."},
// New Zealand
{id:152,name:"Wood",full_name:"Chris Wood",jersey_number:9,team_id:"NZL",position:"FW",tags:["Aerial","Finishing","Hold-up"],age:34,foot:"Right",height:"191cm",weight:"82kg",club:"Nottingham Forest",bio:"New Zealand's all-time leading scorer."},
{id:153,name:"Cacace",full_name:"Liberato Cacace",jersey_number:3,team_id:"NZL",position:"DF",tags:["Overlapping","Pace"],age:25,foot:"Left",height:"180cm",weight:"75kg",club:"Empoli",bio:"Young Kiwi defender in Serie A."},
];

const PLAYERS_BY_ID = new Map(PLAYERS.map(p => [p.id, p]));

export const players_repository = {
  find_all(): Player[] {
    return PLAYERS;
  },
  find_by_id(id: number): Player | undefined {
    return PLAYERS_BY_ID.get(id);
  },
};
