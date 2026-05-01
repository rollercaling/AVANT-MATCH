const LOCAL_CURRENT_MATCH_KEY = "babyfoot_current_match_v2";
const LOCAL_FIREBASE_PROJECT_ID_KEY = "babyfoot_firebase_project_id_v1";
const LIVE_MATCH_COLLECTION = "scoreboard_live";
const LIVE_MATCH_DOCUMENT = "current_match";

const demoStats = {
  tournamentName: "Open Team Cup de Saint Herblain",
  categoryName: "Team Cup",
  roundLabel: "Qualification - Round 4",
  currentSetLabel: "Fin de manche",
  footerLabel: "Coupe de France Baby Foot",
  teamA: {
    name: "Raphael CHUPIN-FOUCHARD",
    score: 14,
    serveGoals: { made: 8, attempts: 20 },
    breakBalls: { made: 8, attempts: 16 },
    longestStreak: 5,
    matchBalls: 0,
  },
  teamB: {
    name: "TEIXEIRA Jonathan",
    score: 20,
    serveGoals: { made: 8, attempts: 16 },
    breakBalls: { made: 12, attempts: 20 },
    longestStreak: 7,
    matchBalls: 3,
  },
};

let firebaseApp = null;
let firestoreDb = null;
let firestoreFns = null;
let liveStatsUnsubscribe = null;

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value ?? "-";
  }
}

function readPath(source, paths, fallback = undefined) {
  for (const path of paths) {
    const value = path.split(".").reduce((cursor, key) => cursor?.[key], source);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percent(made, attempts) {
  const safeMade = numberValue(made);
  const safeAttempts = numberValue(attempts);

  if (!safeAttempts) {
    return 0;
  }

  return Math.round((safeMade / safeAttempts) * 100);
}

function fractionStat(stat) {
  if (typeof stat === "string") {
    const match = stat.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) {
      return stat;
    }

    const made = numberValue(match[1]);
    const attempts = numberValue(match[2]);
    return `${made}/${attempts} (${percent(made, attempts)}%)`;
  }

  const made = numberValue(stat?.made ?? stat?.count ?? stat?.success);
  const attempts = numberValue(stat?.attempts ?? stat?.total);
  return `${made}/${attempts} (${percent(made, attempts)}%)`;
}

function getSetsWon(rawMatch, teamKey) {
  const sets = Array.isArray(rawMatch?.sets) ? rawMatch.sets : [];
  return sets.filter((set) => teamKey === "A" ? set.a > set.b : set.b > set.a).length;
}

function getSetScore(set, teamKey) {
  const keys = teamKey === "A"
    ? ["a", "scoreA", "teamA", "left", "playerA"]
    : ["b", "scoreB", "teamB", "right", "playerB"];

  for (const key of keys) {
    if (set?.[key] !== undefined && set?.[key] !== null) {
      return numberValue(set[key]);
    }
  }

  return 0;
}

function buildScoreLine(rawMatch, data) {
  const sets = Array.isArray(rawMatch?.sets) ? rawMatch.sets : [];
  const completedSetScores = sets.map((set) => `${getSetScore(set, "A")} - ${getSetScore(set, "B")}`);
  const currentScore = `${data.teamA.score} - ${data.teamB.score}`;
  const hasCurrentScore = data.teamA.score > 0 || data.teamB.score > 0;
  const isFinished = rawMatch?.status === "finished";
  const lastCompletedSetScore = completedSetScores[completedSetScores.length - 1];
  const isCurrentScoreAlreadySaved = lastCompletedSetScore === currentScore;

  if (completedSetScores.length > 0) {
    return hasCurrentScore && !isFinished && !isCurrentScoreAlreadySaved
      ? [...completedSetScores, currentScore].join(" | ")
      : completedSetScores.join(" | ");
  }

  return currentScore;
}

function getCurrentPhaseLabel(rawMatch) {
  if (rawMatch?.status === "finished") {
    return "FIN DE MATCH";
  }

  const sets = Array.isArray(rawMatch?.sets) ? rawMatch.sets : [];
  const scoreA = numberValue(rawMatch?.scoreA);
  const scoreB = numberValue(rawMatch?.scoreB);

  if (sets.length > 0 && scoreA === 0 && scoreB === 0) {
    return "ENTRE LES MANCHES";
  }

  return `MANCHE ${sets.length + 1}`;
}

function hasWonSetForStats(playerScore, opponentScore, completedSetsCount, rawMatch) {
  const categoryName = rawMatch?.categoryName || "";
  const tournamentName = rawMatch?.tournamentName || "";
  const roundLabel = rawMatch?.roundLabel || "";
  const isCdfIndiv = normalizeSearch(tournamentName) === "cdf indiv";
  const isShootout = isCdfIndiv && ["forward shootout", "goalie war"].includes(normalizeSearch(categoryName));
  const isShortQualif = isCdfIndiv
    && [
      "double mixte",
      "simple junior u13",
      "simple junior u16",
      "simple junior u19",
      "double junior u13",
      "double junior u16",
      "double junior u19"
    ].includes(normalizeSearch(categoryName))
    && /^qualif tour [1-4]$/i.test(roundLabel);

  if (isShootout) {
    return playerScore >= 10;
  }

  if (isShortQualif) {
    if (playerScore === 7 && opponentScore === 7) {
      return false;
    }
    return playerScore >= 8;
  }

  const isDecidingSet = completedSetsCount === 4;
  if (!isDecidingSet) {
    return playerScore >= 5;
  }

  if (playerScore >= 5 && opponentScore <= 3) {
    return true;
  }
  if (playerScore === 8 && opponentScore === 7) {
    return true;
  }
  return playerScore >= 6 && (playerScore - opponentScore) >= 2;
}

function isSetPointForTeam(team, scoreA, scoreB, completedSetsCount, rawMatch) {
  if (team === "A") {
    return hasWonSetForStats(scoreA + 1, scoreB, completedSetsCount, rawMatch);
  }
  return hasWonSetForStats(scoreB + 1, scoreA, completedSetsCount, rawMatch);
}

function getSetsNeededToWinForStats(rawMatch) {
  const categoryName = rawMatch?.categoryName || "";
  const tournamentName = rawMatch?.tournamentName || "";
  const roundLabel = rawMatch?.roundLabel || "";
  const normalizedCategory = normalizeSearch(categoryName);
  const normalizedRound = normalizeSearch(roundLabel);
  const isCdfIndiv = normalizeSearch(tournamentName) === "cdf indiv";
  const shootoutCategories = ["forward shootout", "goalie war"];
  const shortQualifCategories = [
    "double mixte",
    "simple junior u13",
    "simple junior u16",
    "simple junior u19",
    "double junior u13",
    "double junior u16",
    "double junior u19"
  ];
  const doubleMixteMainDrawRounds = [
    "64eme de final",
    "32eme de final",
    "16eme de final",
    "8eme de final",
    "quart de final"
  ];
  const isQualifRound = /^qualif tour [1-4]$/i.test(roundLabel) || /^qualif tour [1-4]$/.test(normalizedRound);

  if (normalizedCategory === "grande finale de la coupe de france") {
    return 1;
  }

  if (isCdfIndiv && shootoutCategories.includes(normalizedCategory)) {
    return 1;
  }

  if (isCdfIndiv && isQualifRound && shortQualifCategories.includes(normalizedCategory)) {
    return 1;
  }

  if (isCdfIndiv && normalizedCategory === "double mixte" && doubleMixteMainDrawRounds.includes(normalizedRound)) {
    return 2;
  }

  if (isCdfIndiv && isQualifRound) {
    return 2;
  }

  return 3;
}

function computeStatsFromGoals(rawMatch) {
  const goals = Array.isArray(rawMatch?.goals) ? [...rawMatch.goals].sort((a, b) => numberValue(a.sequence) - numberValue(b.sequence)) : [];
  const setsNeededToWin = getSetsNeededToWinForStats(rawMatch);
  const stats = {
    engagement: {
      A: { made: 0, attempts: 0 },
      B: { made: 0, attempts: 0 },
    },
    setPoint: {
      A: { made: 0, attempts: 0 },
      B: { made: 0, attempts: 0 },
    },
    streak: {
      A: 0,
      B: 0,
    },
    matchPoint: {
      A: 0,
      B: 0,
    },
  };

  let scoreA = 0;
  let scoreB = 0;
  let completedSetsCount = 0;
  let setsWonA = 0;
  let setsWonB = 0;
  let engagementTeam = "A";
  let currentStreakTeam = null;
  let currentStreakCount = 0;

  for (const goal of goals) {
    const team = goal.team === "B" ? "B" : "A";
    const opponent = team === "A" ? "B" : "A";
    const aSetPoint = isSetPointForTeam("A", scoreA, scoreB, completedSetsCount, rawMatch);
    const bSetPoint = isSetPointForTeam("B", scoreA, scoreB, completedSetsCount, rawMatch);

    stats.engagement[engagementTeam].attempts += 1;
    if (team === engagementTeam) {
      stats.engagement[team].made += 1;
    }

    if (aSetPoint) {
      stats.setPoint.A.attempts += 1;
      if (setsWonA + 1 >= setsNeededToWin) {
        stats.matchPoint.A += 1;
      }
    }
    if (bSetPoint) {
      stats.setPoint.B.attempts += 1;
      if (setsWonB + 1 >= setsNeededToWin) {
        stats.matchPoint.B += 1;
      }
    }

    if (team === "A") {
      scoreA += 1;
    } else {
      scoreB += 1;
    }

    if (currentStreakTeam === team) {
      currentStreakCount += 1;
    } else {
      currentStreakTeam = team;
      currentStreakCount = 1;
    }
    stats.streak[team] = Math.max(stats.streak[team], currentStreakCount);

    const aWonSet = hasWonSetForStats(scoreA, scoreB, completedSetsCount, rawMatch);
    const bWonSet = hasWonSetForStats(scoreB, scoreA, completedSetsCount, rawMatch);

    if (team === "A" && aSetPoint && aWonSet) {
      stats.setPoint.A.made += 1;
    }
    if (team === "B" && bSetPoint && bWonSet) {
      stats.setPoint.B.made += 1;
    }

    if (aWonSet || bWonSet) {
      if (aWonSet) {
        setsWonA += 1;
      }
      if (bWonSet) {
        setsWonB += 1;
      }
      completedSetsCount += 1;
      scoreA = 0;
      scoreB = 0;
      engagementTeam = "A";
    } else {
      engagementTeam = opponent;
    }
  }

  return stats;
}

function normalizeSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeSide(rawTeam, rawStats, sideKey) {
  const prefix = sideKey === "teamA" ? "left" : "right";
  const liveScorePath = sideKey === "teamA" ? "scoreA" : "scoreB";
  const score = readPath(rawTeam, ["score", "points", "goals"], readPath(rawStats, [`${prefix}.score`, `${sideKey}.score`, liveScorePath], 0));

  return {
    name: readPath(rawTeam, ["name", "playerName", "label"], sideKey === "teamA" ? "JOUEUR 1" : "JOUEUR 2"),
    score: numberValue(score),
    serveGoals: readPath(rawStats, [`${prefix}.serveGoals`, `${sideKey}.serveGoals`, `${prefix}.engagementGoals`, `${sideKey}.engagementGoals`], rawTeam?.serveGoals),
    breakBalls: readPath(rawStats, [`${prefix}.breakBalls`, `${sideKey}.breakBalls`, `${prefix}.breakGoals`, `${sideKey}.breakGoals`], rawTeam?.breakBalls),
    longestStreak: numberValue(readPath(rawStats, [`${prefix}.longestStreak`, `${sideKey}.longestStreak`, `${prefix}.longestGoalStreak`, `${sideKey}.longestGoalStreak`], rawTeam?.longestStreak)),
    matchBalls: numberValue(readPath(rawStats, [`${prefix}.matchBalls`, `${sideKey}.matchBalls`, `${prefix}.matchPoints`, `${sideKey}.matchPoints`], rawTeam?.matchBalls)),
  };
}

function normalizeMatchStats(rawMatch) {
  const stats = rawMatch?.stats || rawMatch?.matchStats || {};
  const computedStats = computeStatsFromGoals(rawMatch);
  const teamA = normalizeSide(rawMatch?.teamA || rawMatch?.left || {}, stats, "teamA");
  const teamB = normalizeSide(rawMatch?.teamB || rawMatch?.right || {}, stats, "teamB");
  teamA.score = numberValue(rawMatch?.scoreA, teamA.score);
  teamB.score = numberValue(rawMatch?.scoreB, teamB.score);
  teamA.serveGoals = teamA.serveGoals || computedStats.engagement.A;
  teamB.serveGoals = teamB.serveGoals || computedStats.engagement.B;
  teamA.breakBalls = teamA.breakBalls || computedStats.setPoint.A;
  teamB.breakBalls = teamB.breakBalls || computedStats.setPoint.B;
  teamA.longestStreak = computedStats.streak.A;
  teamB.longestStreak = computedStats.streak.B;
  teamA.matchBalls = computedStats.matchPoint.A;
  teamB.matchBalls = computedStats.matchPoint.B;

  return {
    tournamentName: rawMatch?.tournamentName || "TOURNOI",
    categoryName: rawMatch?.categoryName || "CATEGORIE",
    roundLabel: rawMatch?.roundLabel || "TOUR",
    currentSetLabel: rawMatch?.currentSetLabel || rawMatch?.phaseLabel || getCurrentPhaseLabel(rawMatch),
    footerLabel: rawMatch?.footerLabel || rawMatch?.tournamentName || "COUPE DE FRANCE BABY FOOT",
    setsWonA: getSetsWon(rawMatch, "A"),
    setsWonB: getSetsWon(rawMatch, "B"),
    teamA,
    teamB,
  };
}

function renderStats(rawMatch) {
  const data = normalizeMatchStats(rawMatch || demoStats);

  setText("tournamentName", data.tournamentName);
  setText("categoryName", data.categoryName);
  setText("roundLabel", data.roundLabel);
  setText("leftPlayerName", data.teamA.name);
  setText("rightPlayerName", data.teamB.name);
  setText("currentSetLabel", data.currentSetLabel);
  setText("scoreLine", buildScoreLine(rawMatch || demoStats, data));
  setText("leftScore", data.teamA.score);
  setText("rightScore", data.teamB.score);
  setText("leftServeGoals", fractionStat(data.teamA.serveGoals));
  setText("rightServeGoals", fractionStat(data.teamB.serveGoals));
  setText("leftBreakBalls", fractionStat(data.teamA.breakBalls));
  setText("rightBreakBalls", fractionStat(data.teamB.breakBalls));
  setText("leftLongestStreak", data.teamA.longestStreak);
  setText("rightLongestStreak", data.teamB.longestStreak);
  setText("leftMatchBalls", data.teamA.matchBalls);
  setText("rightMatchBalls", data.teamB.matchBalls);
  setText("statsFooterLabel", data.footerLabel);
}

function readCurrentMatchFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_CURRENT_MATCH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Impossible de lire le match courant depuis localStorage :", error);
    return null;
  }
}

function getFirebaseConfig() {
  const projectId = localStorage.getItem(LOCAL_FIREBASE_PROJECT_ID_KEY) || "donnees-scoreboard";

  return {
    apiKey: "AIzaSyDaxmq1InTn2hw-Zn0vP9VCQcNT_C2DWfY",
    authDomain: "donnees-scoreboard.firebaseapp.com",
    projectId,
    storageBucket: "donnees-scoreboard.firebasestorage.app",
    messagingSenderId: "135990680324",
    appId: "1:135990680324:web:3a3004df845276cb74ce51",
  };
}

async function initFirebase() {
  if (firebaseApp && firestoreDb && firestoreFns) {
    return true;
  }

  try {
    const config = getFirebaseConfig();
    const [{ initializeApp }, firestoreModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js"),
    ]);

    firebaseApp = initializeApp(config);
    firestoreDb = firestoreModule.getFirestore(firebaseApp);
    firestoreFns = firestoreModule;
    return true;
  } catch (error) {
    console.error("Erreur Firebase stats :", error);
    return false;
  }
}

async function startLiveStatsSync() {
  const ready = await initFirebase();
  if (!ready || !firestoreDb || !firestoreFns || liveStatsUnsubscribe) {
    return;
  }

  const { doc, onSnapshot } = firestoreFns;
  const liveRef = doc(firestoreDb, LIVE_MATCH_COLLECTION, LIVE_MATCH_DOCUMENT);

  liveStatsUnsubscribe = onSnapshot(
    liveRef,
    (snapshot) => {
      if (snapshot.exists()) {
        renderStats(snapshot.data());
      }
    },
    (error) => {
      console.error("Sync live stats indisponible :", error);
    }
  );
}

renderStats(readCurrentMatchFromLocalStorage() || demoStats);
startLiveStatsSync();

window.addEventListener("storage", (event) => {
  if (event.key === LOCAL_CURRENT_MATCH_KEY) {
    renderStats(readCurrentMatchFromLocalStorage() || demoStats);
  }
});

window.renderStats = renderStats;
