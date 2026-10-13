# Firestore rules

`firestore.rules` locks the game down so only people in a room can change it:

- Players can only edit their own document, and their answers only while a round is open.
- Only the TV (host) or the dealer can change scores, approvals, pauses and round flow.
- Any player can hit STOP during the fast-or-slow call, but only in their own name.
- The Expo app keeps working: each player can write only their own `users/{uid}` and `leaderboard/{uid}` document. Everything else outside `rooms` is closed.

## Test before deploying

Needs Java (for the Firestore emulator). The first run downloads the Firebase CLI and the emulator. From this folder:

```bash
npm install
npm run test:rules
```

Every write the TV and phone apps make has an "allowed" test, and the important abuses have "blocked" tests. All should pass.

Players in a room are still trusted to a degree: a player can make themselves dealer, and whoever hits STOP reports the letter. Fully cheat-proof rounds would need the round logic in Cloud Functions.

## Deploy

```bash
npx firebase-tools login
npx firebase-tools use <your-project-id>
npx firebase-tools deploy --only firestore:rules
```

Or paste `firestore.rules` into Firebase Console > Firestore > Rules and publish.

Deploy the rules **after** both apps are on the version with the fast-or-slow call. Older app versions make writes these rules don't allow.

To undo, publish the previous rules from the console's rules history.
