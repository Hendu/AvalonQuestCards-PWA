import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            'REDACTED',
  authDomain:        'avalon-quest-cards.firebaseapp.com',
  projectId:         'avalon-quest-cards',
  storageBucket:     'avalon-quest-cards.firebasestorage.app',
  messagingSenderId: '800039701909',
  appId:             '1:800039701909:web:REDACTED',
  measurementId:     'REDACTED',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
