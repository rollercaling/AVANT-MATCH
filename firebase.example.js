/*
  Exemple de point de depart pour brancher Firestore + Storage.
  Remplacez les valeurs du `firebaseConfig`, puis adaptez les noms
  de collection/document selon votre structure.
*/

/*
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  doc,
  getDoc,
  getFirestore,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "A_REMPLIR",
  authDomain: "A_REMPLIR",
  projectId: "A_REMPLIR",
  storageBucket: "A_REMPLIR",
  messagingSenderId: "A_REMPLIR",
  appId: "A_REMPLIR",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export async function loadMatch(matchId) {
  const snapshot = await getDoc(doc(db, "matches", matchId));

  if (!snapshot.exists()) {
    throw new Error(`Match introuvable: ${matchId}`);
  }

  const data = snapshot.data();

  const leftPhotoUrl = data.left?.photoPath
    ? await getDownloadURL(ref(storage, data.left.photoPath))
    : "";
  const rightPhotoUrl = data.right?.photoPath
    ? await getDownloadURL(ref(storage, data.right.photoPath))
    : "";

  return {
    left: {
      name: data.left?.name ?? "Joueur 1",
      tag: data.left?.tag ?? "Equipe A",
      rankings: {
        general: data.left?.rankings?.general ?? "-",
        single: data.left?.rankings?.single ?? "-",
        double: data.left?.rankings?.double ?? "-",
        openDoubleTeam: data.left?.rankings?.openDoubleTeam ?? "-",
        openMixed: data.left?.rankings?.openMixed ?? "-",
        openMixedTeam: data.left?.rankings?.openMixedTeam ?? "-",
      },
      photoUrl: leftPhotoUrl,
    },
    right: {
      name: data.right?.name ?? "Joueur 2",
      tag: data.right?.tag ?? "Equipe B",
      rankings: {
        general: data.right?.rankings?.general ?? "-",
        single: data.right?.rankings?.single ?? "-",
        double: data.right?.rankings?.double ?? "-",
        openDoubleTeam: data.right?.rankings?.openDoubleTeam ?? "-",
        openMixed: data.right?.rankings?.openMixed ?? "-",
        openMixedTeam: data.right?.rankings?.openMixedTeam ?? "-",
      },
      photoUrl: rightPhotoUrl,
    },
  };
}

// Exemple d'utilisation dans app.js :
// import { loadMatch } from "./firebase.js";
// const match = await loadMatch("match-001");
// window.renderMatch(match);
*/
