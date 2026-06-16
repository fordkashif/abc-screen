import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './config';

export async function findRoomIdByCode(code: string): Promise<string | null> {
  const q = query(collection(db, 'rooms'), where('code', '==', code.toUpperCase().trim()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].id;
}
