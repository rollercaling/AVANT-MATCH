const fallbackPhoto =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 860">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fafafc" />
          <stop offset="60%" stop-color="#d9dbe3" />
          <stop offset="100%" stop-color="#bcc0cc" />
        </linearGradient>
      </defs>
      <rect width="720" height="860" fill="url(#bg)" />
      <circle cx="360" cy="285" r="118" fill="#8a8d9a" opacity="0.65" />
      <path d="M184 706c30-148 126-212 176-212s146 64 176 212" fill="#8a8d9a" opacity="0.65" />
    </svg>
  `);

const waitingData = {
  badgeText: "FORMAT DU MATCH",
  rules: [
    "Eliminatoire - 3 manches gagnantes de 5 points",
    "2 temps morts par manches de 30sec",
    "1m30 entre chaque manches",
  ],
};

const QUALIFICATION_ROUNDS = [
  "QUALIF TOUR 1",
  "QUALIF TOUR 2",
  "QUALIF TOUR 3",
  "QUALIF TOUR 4",
];

const MAIN_DRAW_ROUNDS = [
  "64EME DE FINAL",
  "32EME DE FINAL",
  "16EME DE FINAL",
  "8EME DE FINAL",
  "QUART DE FINAL",
  "DEMI FINAL",
  "FINAL",
];

const DOUBLE_MIXTE_MAIN_DRAW_ROUNDS = [
  "64EME DE FINAL",
  "32EME DE FINAL",
  "16EME DE FINAL",
  "8EME DE FINAL",
  "QUART DE FINAL",
];

const SHORT_MATCH_CATEGORIES = [
  "Double Mixte",
  "Simple Junior U13",
  "Simple Junior U16",
  "Simple Junior U19",
  "Double Junior U13",
  "Double Junior U16",
  "Double Junior U19",
];

const SHOOTOUT_CATEGORIES = [
  "Goalie War",
  "Forward Shootout",
];

const matchData = {
  badgeText: "VS",
  categoryName: "Simple Masculin - Pro/Expert",
  headToHead: {
    confrontations: 0,
    victoryA: 0,
    victoryB: 0,
  },
  left: {
    name: "Joueur 1",
    tag: "0 VICTOIRE",
    rankings: {
      general: 12,
      single: 7,
      double: 18,
      openDoubleTeam: 9,
      openMixed: 14,
      openMixedTeam: 8,
    },
    photoUrl: "",
  },
  right: {
    name: "Joueur 2",
    tag: "0 VICTOIRE",
    rankings: {
      general: 5,
      single: 3,
      double: 11,
      openDoubleTeam: 6,
      openMixed: 10,
      openMixedTeam: 4,
    },
    photoUrl: "",
  },
};

const body = document.body;
const waitingScreen = document.getElementById("waitingScreen");
const introScreen = document.getElementById("introScreen");
const launchButton = document.getElementById("launchMatchButton");
const waitingRules = document.getElementById("waitingRules");
const waitingBadgeTextEl = document.getElementById("waitingBadgeText");
const liveMatchContext = document.getElementById("liveMatchContext");
const headToHeadConfrontations = document.getElementById("headToHeadConfrontations");
const LOCAL_CURRENT_MATCH_KEY = "babyfoot_current_match_v2";
const LOCAL_FIREBASE_PROJECT_ID_KEY = "babyfoot_firebase_project_id_v1";
const LIVE_MATCH_COLLECTION = "scoreboard_live";
const LIVE_MATCH_DOCUMENT = "current_match";

let firebaseApp = null;
let firestoreDb = null;
let firestoreFns = null;
let firebaseStorage = null;
let liveMatchUnsubscribe = null;

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value ?? "-";
  }
}

function fitWaitingBadgeText() {
  if (!waitingBadgeTextEl) {
    return;
  }

  let size = 40;
  waitingBadgeTextEl.style.fontSize = `${size}px`;

  while (size > 18 && waitingBadgeTextEl.scrollWidth > waitingBadgeTextEl.clientWidth) {
    size -= 1;
    waitingBadgeTextEl.style.fontSize = `${size}px`;
  }
}

function setPhoto(id, photoUrl, playerName) {
  const node = document.getElementById(id);
  if (!node) {
    return;
  }

  node.onerror = () => {
    node.onerror = null;
    node.src = fallbackPhoto;
  };
  node.src = photoUrl || fallbackPhoto;
  node.alt = playerName ? `Photo de ${playerName}` : "Photo du joueur";
}

function renderWaitingScreen(data) {
  setText("waitingBadgeText", data.badgeText);
  fitWaitingBadgeText();

  if (!waitingRules) {
    return;
  }

  waitingRules.innerHTML = "";

  for (const rule of data.rules ?? []) {
    const item = document.createElement("li");
    item.textContent = rule;
    waitingRules.appendChild(item);
  }
}

function formatRank(value) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  return String(value).startsWith("#") ? String(value) : `#${value}`;
}

function toNonNegativeInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatCountLabel(value, singularLabel, pluralLabel) {
  const count = toNonNegativeInteger(value);
  return `${count} ${count > 1 ? pluralLabel : singularLabel}`;
}

function normalizeHeadToHead(liveMatch) {
  return {
    confrontations: toNonNegativeInteger(liveMatch?.headToHead?.confrontations ?? liveMatch?.confrontationCount),
    victoryA: toNonNegativeInteger(liveMatch?.headToHead?.victoryA ?? liveMatch?.victoryPlayerA),
    victoryB: toNonNegativeInteger(liveMatch?.headToHead?.victoryB ?? liveMatch?.victoryPlayerB),
  };
}

function renderHeadToHead(headToHead) {
  if (!headToHeadConfrontations) {
    return;
  }

  headToHeadConfrontations.textContent = formatCountLabel(
    headToHead?.confrontations,
    "CONFRONTATION",
    "CONFRONTATIONS"
  );
}

function renderRankingRows(prefix, rows) {
  const safeRows = rows?.length ? rows.slice(0, 3) : [
    { label: "General", value: "-" },
    { label: "Open Simple", value: "-" },
    { label: "Open Double", value: "-" },
  ];

  for (let index = 0; index < 3; index += 1) {
    const row = safeRows[index] ?? { label: "-", value: "-" };
    setText(`${prefix}RankLabel${index + 1}`, row.label);
    setText(`${prefix}RankValue${index + 1}`, formatRank(row.value));
  }
}

function isCategory(categoryName, expectedName) {
  return normalizeSearch(categoryName) === normalizeSearch(expectedName);
}

function buildRankingRows(player, categoryName) {
  const rankings = player?.rankings ?? {};
  const playerRankings = player?.playerRankings ?? [];

  if (isCategory(categoryName, "Double Masculin")) {
    return [
      { label: "Open Double (équipe)", value: rankings.openDoubleTeam },
      { label: "Open Double Joueur 1", value: playerRankings[0]?.double ?? rankings.doublePlayer1 ?? rankings.double },
      { label: "Open Double Joueur 2", value: playerRankings[1]?.double ?? rankings.doublePlayer2 ?? "-" },
    ];
  }

  if (isCategory(categoryName, "Double Mixte")) {
    return [
      { label: "Open Mixte (équipe)", value: rankings.openMixedTeam },
      { label: "Open Mixte Joueur 1", value: playerRankings[0]?.openMixed ?? rankings.openMixedPlayer1 ?? rankings.openMixed },
      { label: "Open Mixte Joueur 2", value: playerRankings[1]?.openMixed ?? rankings.openMixedPlayer2 ?? "-" },
    ];
  }

  return [
    { label: "General", value: rankings.general },
    { label: "Open Simple", value: rankings.single },
    { label: "Open Double", value: rankings.double },
  ];
}

function renderPlayer(side, player) {
  const prefix = side === "left" ? "left" : "right";

  setText(`${prefix}Name`, player.name);
  setText(`${prefix}Tag`, player.tag);
  renderRankingRows(prefix, player.rankingRows ?? buildRankingRows(player, matchData.categoryName));
  setPhoto(`${prefix}Photo`, player.photoUrl, player.name);
}

function renderMatch(data) {
  setText("matchBadgeText", data.badgeText ?? "VS");
  renderHeadToHead(data.headToHead);
  renderPlayer("left", {
    ...data.left,
    rankingRows: data.left?.rankingRows ?? buildRankingRows(data.left, data.categoryName),
  });
  renderPlayer("right", {
    ...data.right,
    rankingRows: data.right?.rankingRows ?? buildRankingRows(data.right, data.categoryName),
  });
}

function renderLiveMatchContext(liveMatch) {
  if (!liveMatchContext) {
    return;
  }

  const tournamentName = liveMatch?.tournamentName || "TOURNOI";
  const categoryName = liveMatch?.categoryName || "CATEGORIE";
  const roundLabel = liveMatch?.roundLabel || "TOUR";
  liveMatchContext.textContent = `${tournamentName} - ${categoryName} - ${roundLabel}`;
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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "non_defini";
}

function normalizeSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeRoundLabel(roundLabel) {
  return normalizeSearch(roundLabel)
    .replace(/eme/g, "eme")
    .replace(/è/g, "e")
    .replace(/é/g, "e")
    .toUpperCase();
}

function isQualificationRound(roundLabel) {
  return QUALIFICATION_ROUNDS.includes(normalizeRoundLabel(roundLabel));
}

function isMainDrawRound(roundLabel) {
  return MAIN_DRAW_ROUNDS.includes(normalizeRoundLabel(roundLabel));
}

function isDoubleMixteMainDrawRound(roundLabel) {
  return DOUBLE_MIXTE_MAIN_DRAW_ROUNDS.includes(normalizeRoundLabel(roundLabel));
}

function isShortMatchCategory(categoryName) {
  return SHORT_MATCH_CATEGORIES.includes(categoryName);
}

function isShootoutCategory(categoryName) {
  return SHOOTOUT_CATEGORIES.includes(categoryName);
}

function buildWaitingBadgeText(liveMatch) {
  const categoryName = liveMatch?.categoryName || "CATEGORIE";
  const roundLabel = liveMatch?.roundLabel || "TOUR";
  return `${categoryName} - ${roundLabel}`;
}

function buildMatchFormatRule(categoryName, roundLabel) {
  if (categoryName === "Grande Finale de la Coupe de France") {
    return "Match de 30 points, divisés en 6 relais de 5 points";
  }

  if (isShootoutCategory(categoryName)) {
    if (isQualificationRound(roundLabel)) {
      return "Qualifications - 1 manche gagnante de 10 points";
    }
    if (isMainDrawRound(roundLabel)) {
      return "Eliminatoire - 1 manche gagnante de 10 points";
    }
  }

  if (categoryName === "Double Mixte") {
    if (isQualificationRound(roundLabel)) {
      return "Qualifications - 1 manche gagnante de 8 points (7-7 égalité)";
    }
    if (isDoubleMixteMainDrawRound(roundLabel)) {
      return "Eliminatoires - 2 manches gagnantes de 5 points";
    }
  }

  if (isShortMatchCategory(categoryName) && isQualificationRound(roundLabel)) {
    return "Qualifications - 1 manche gagnante de 8 points (7-7 egalite)";
  }

  if (isQualificationRound(roundLabel)) {
    return "Qualifications - 2 manches gagnantes de 5 points";
  }

  if (isMainDrawRound(roundLabel)) {
    return "Eliminatoire - 3 manches gagnantes de 5 points";
  }

  return "Eliminatoire - 3 manches gagnantes de 5 points";
}

function shouldShowBreakRule(categoryName, roundLabel) {
  if (categoryName === "Grande Finale de la Coupe de France") {
    return false;
  }

  if (isShootoutCategory(categoryName)) {
    return false;
  }

  if (isShortMatchCategory(categoryName) && isQualificationRound(roundLabel)) {
    return false;
  }

  return true;
}

async function renderFromCurrentMatch(match) {
  if (!match) {
    return;
  }

  try {
    const nextData = await buildAvantMatchFromLiveMatch(match);
    renderWaitingScreen(nextData.waiting);
    renderMatch(nextData.match);
    renderLiveMatchContext(match);
  } catch (error) {
    console.error("Impossible de rendre l'avant-match depuis le match courant :", error);
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

function normalizePhotoFileStem(playerName) {
  return String(playerName || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

function buildPhotoCandidates(playerName) {
  const stem = normalizePhotoFileStem(playerName);
  if (!stem) {
    return [];
  }

  const extensions = ["png", "jpg", "jpeg", "jfif", "webp"];
  return extensions.map((extension) => `../../PHOTOS JOUEURS/${encodeURIComponent(stem)}.${extension}`);
}

function resolveLocalPhoto(playerName) {
  const candidates = buildPhotoCandidates(playerName);
  if (!candidates.length) {
    return Promise.resolve("");
  }

  return new Promise((resolve) => {
    let index = 0;

    const tryNext = () => {
      if (index >= candidates.length) {
        resolve("");
        return;
      }

      const url = candidates[index];
      index += 1;

      const image = new Image();
      image.onload = () => resolve(url);
      image.onerror = tryNext;
      image.src = url;
    };

    tryNext();
  });
}

async function resolveStoragePhoto(photoPath) {
  if (!photoPath || !firebaseStorage) {
    return "";
  }

  try {
    const storageModule = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js");
    return await storageModule.getDownloadURL(storageModule.ref(firebaseStorage, photoPath));
  } catch (error) {
    console.error("Impossible de charger la photo Firebase Storage :", error);
    return "";
  }
}

async function loadPlayerProfileFromFirestore(tournamentId, categoryId, playerName) {
  if (!tournamentId || !categoryId || !playerName) {
    return null;
  }

  const ready = await initFirebase();
  if (!ready || !firestoreDb || !firestoreFns) {
    return null;
  }

  try {
    const { doc, getDoc } = firestoreFns;
    const playerRef = doc(
      firestoreDb,
      "tournaments",
      tournamentId,
      "categories",
      categoryId,
      "players",
      slugify(playerName)
    );
    const snapshot = await getDoc(playerRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data() || {};
    const resolvedName = data.name || playerName;
    return {
      id: data.id || slugify(resolvedName),
      name: resolvedName,
      normalizedName: data.normalizedName || normalizeSearch(resolvedName),
      photoPath: data.photoPath || "",
      photoUrl: data.photoUrl || await resolveStoragePhoto(data.photoPath),
      rankings: {
        general: data?.rankings?.general ?? "-",
        simple: data?.rankings?.simple ?? "-",
        double: data?.rankings?.double ?? "-",
        openDoubleTeam:
          data?.rankings?.openDoubleTeam ??
          data?.rankings?.doubleTeam ??
          data?.rankings?.open_double_team ??
          "-",
        openMixed:
          data?.rankings?.openMixed ??
          data?.rankings?.openMixte ??
          data?.rankings?.open_mixed ??
          data?.rankings?.open_mixte ??
          "-",
        openMixedTeam:
          data?.rankings?.openMixedTeam ??
          data?.rankings?.openMixteTeam ??
          data?.rankings?.mixedTeam ??
          data?.rankings?.mixteTeam ??
          data?.rankings?.open_mixed_team ??
          data?.rankings?.open_mixte_team ??
          "-"
      }
    };
  } catch (error) {
    console.error("Impossible de charger la fiche joueur Firestore :", error);
    return null;
  }
}

function extractTeamPlayerNames(team, fallbackName) {
  const players = team?.players || team?.members || team?.playerNames;

  if (Array.isArray(players)) {
    const names = players
      .map((player) => typeof player === "string" ? player : player?.name || player?.playerName)
      .filter(Boolean);

    if (names.length) {
      return names.slice(0, 2);
    }
  }

  const explicitNames = [
    team?.player1Name || team?.playerAName || team?.playerOneName,
    team?.player2Name || team?.playerBName || team?.playerTwoName,
  ].filter(Boolean);

  if (explicitNames.length) {
    return explicitNames.slice(0, 2);
  }

  return [fallbackName].filter(Boolean);
}

async function loadTeamPlayerProfiles(tournamentId, categoryId, team, fallbackName) {
  const names = extractTeamPlayerNames(team, fallbackName);
  return Promise.all(
    names.map((name) => loadPlayerProfileFromFirestore(tournamentId, categoryId, name))
  );
}

function pickRanking(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? "-";
}

function buildTeamRankings(primaryProfile, team) {
  const sourceRankings = primaryProfile?.rankings ?? {};
  const teamRankings = team?.rankings ?? {};

  return {
    general: pickRanking(sourceRankings.general, teamRankings.general),
    single: pickRanking(sourceRankings.simple, sourceRankings.single, teamRankings.simple, teamRankings.single),
    double: pickRanking(sourceRankings.double, teamRankings.double, teamRankings.openDouble),
    openDoubleTeam: pickRanking(sourceRankings.openDoubleTeam, teamRankings.openDoubleTeam, teamRankings.doubleTeam),
    openMixed: pickRanking(sourceRankings.openMixed, sourceRankings.openMixte, teamRankings.openMixed, teamRankings.openMixte),
    openMixedTeam: pickRanking(sourceRankings.openMixedTeam, sourceRankings.openMixteTeam, teamRankings.openMixedTeam, teamRankings.openMixteTeam, teamRankings.mixedTeam),
  };
}

function buildPlayerRankingList(profiles) {
  return profiles.map((profile) => ({
    name: profile?.name,
    double: profile?.rankings?.double ?? "-",
    openMixed: profile?.rankings?.openMixed ?? "-",
  }));
}

function buildRulesFromLiveMatch(liveMatch) {
  const rules = [];
  const categoryName = liveMatch?.categoryName || "Categorie";
  const roundLabel = liveMatch?.roundLabel || "Match a venir";

  if (categoryName === "Grande Finale de la Coupe de France") {
    rules.push("Match de 30 points, divisés en 6 relais de 5 points");
    rules.push("Match nul à 29-29 puis penalty avec 4 tireurs");
    rules.push("1 temps mort par relais");
    return rules;
  }

  if (categoryName === "Goalie War") {
    rules.push(buildMatchFormatRule(categoryName, roundLabel));
    rules.push("Pas de temps mort");
    rules.push("Limite de temps - 10sec pour jouer la balle");
    return rules;
  }

  if (categoryName === "Forward Shootout") {
    rules.push(buildMatchFormatRule(categoryName, roundLabel));
    rules.push("Pas de temps mort");
    rules.push("Limite de temps - 15sec pour jouer la balle");
    return rules;
  }

  rules.push(buildMatchFormatRule(categoryName, roundLabel));
  rules.push("2 temps morts par manches");
  if (shouldShowBreakRule(categoryName, roundLabel)) {
    rules.push("1m30sec entre chaque manches");
  }
  return rules;
}

async function buildAvantMatchFromLiveMatch(liveMatch) {
  const leftName = liveMatch?.teamA?.name || "Joueur 1";
  const rightName = liveMatch?.teamB?.name || "Joueur 2";
  const tournamentId = liveMatch?.tournamentId || slugify(liveMatch?.tournamentName);
  const categoryId = liveMatch?.categoryId || slugify(liveMatch?.categoryName);
  const [leftProfiles, rightProfiles] = await Promise.all([
    loadTeamPlayerProfiles(tournamentId, categoryId, liveMatch?.teamA, leftName),
    loadTeamPlayerProfiles(tournamentId, categoryId, liveMatch?.teamB, rightName),
  ]);
  const leftProfile = leftProfiles[0];
  const rightProfile = rightProfiles[0];
  const [leftPhotoUrl, rightPhotoUrl] = await Promise.all([
    leftProfile?.photoUrl ? Promise.resolve(leftProfile.photoUrl) : resolveLocalPhoto(leftName),
    rightProfile?.photoUrl ? Promise.resolve(rightProfile.photoUrl) : resolveLocalPhoto(rightName),
  ]);
  const leftRankings = buildTeamRankings(leftProfile, liveMatch?.teamA);
  const rightRankings = buildTeamRankings(rightProfile, liveMatch?.teamB);
  const headToHead = normalizeHeadToHead(liveMatch);

  return {
    waiting: {
      badgeText: buildWaitingBadgeText(liveMatch),
      rules: buildRulesFromLiveMatch(liveMatch),
    },
    match: {
      badgeText: "VS",
      categoryName: liveMatch?.categoryName,
      headToHead,
      left: {
        name: leftProfile?.name || leftName,
        tag: formatCountLabel(headToHead.victoryA, "VICTOIRE", "VICTOIRES"),
        rankings: leftRankings,
        playerRankings: buildPlayerRankingList(leftProfiles),
        photoUrl: leftPhotoUrl,
      },
      right: {
        name: rightProfile?.name || rightName,
        tag: formatCountLabel(headToHead.victoryB, "VICTOIRE", "VICTOIRES"),
        rankings: rightRankings,
        playerRankings: buildPlayerRankingList(rightProfiles),
        photoUrl: rightPhotoUrl,
      },
    },
  };
}

async function initFirebase() {
  if (firebaseApp && firestoreDb && firestoreFns) {
    return true;
  }

  try {
    const config = getFirebaseConfig();
    const [{ initializeApp }, firestoreModule, storageModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js"),
      import("https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js"),
    ]);

    firebaseApp = initializeApp(config);
    firestoreDb = firestoreModule.getFirestore(firebaseApp);
    firestoreFns = firestoreModule;
    firebaseStorage = storageModule.getStorage(firebaseApp);
    return true;
  } catch (error) {
    console.error("Erreur Firebase avant-match :", error);
    return false;
  }
}

async function startLiveMatchSync() {
  const ready = await initFirebase();
  if (!ready || !firestoreDb || !firestoreFns || liveMatchUnsubscribe) {
    return;
  }

  const { doc, onSnapshot } = firestoreFns;
  const liveRef = doc(firestoreDb, LIVE_MATCH_COLLECTION, LIVE_MATCH_DOCUMENT);

  liveMatchUnsubscribe = onSnapshot(
    liveRef,
    async (snapshot) => {
      if (!snapshot.exists()) {
        return;
      }

      try {
        const liveMatch = snapshot.data() || {};
        await renderFromCurrentMatch(liveMatch);
      } catch (error) {
        console.error("Impossible de convertir le match live pour l'avant-match :", error);
      }
    },
    (error) => {
      console.error("Sync live avant-match indisponible :", error);
    }
  );
}

function showIntroScreen() {
  if (!waitingScreen || !introScreen) {
    return;
  }

  if (body.classList.contains("state-transition") || body.classList.contains("state-intro")) {
    return;
  }

  launchButton?.setAttribute("disabled", "disabled");
  body.classList.remove("state-waiting");
  body.classList.remove("state-intro");
  body.classList.add("state-transition");

  waitingScreen.classList.remove("is-visible");
  waitingScreen.classList.add("is-leaving");

  introScreen.classList.add("is-visible");

  window.setTimeout(() => {
    body.classList.remove("state-transition");
    body.classList.add("state-intro");
    waitingScreen.classList.remove("is-leaving");
  }, 7600);
}

launchButton?.addEventListener("click", showIntroScreen);

renderWaitingScreen(waitingData);
renderMatch(matchData);
renderFromCurrentMatch(readCurrentMatchFromLocalStorage());
startLiveMatchSync();

window.addEventListener("storage", (event) => {
  if (event.key !== LOCAL_CURRENT_MATCH_KEY) {
    return;
  }

  renderFromCurrentMatch(readCurrentMatchFromLocalStorage());
});

window.addEventListener("resize", fitWaitingBadgeText);

window.renderMatch = renderMatch;
window.renderWaitingScreen = renderWaitingScreen;
window.showIntroScreen = showIntroScreen;

/*
  Branchez Firebase ici quand vos collections seront pretes.
  Workflow conseille :
  1. Charger les regles pour l'ecran d'attente
  2. Charger les joueurs/classements pour l'ecran avant-match
  3. Resoudre les photos Firebase Storage
  4. Appeler `renderWaitingScreen(...)` puis `renderMatch(...)`
*/
