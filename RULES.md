# Firestore rules

`firestore.rules` locks the game down so only people in a room can change it:

- Players can only edit their own document, and their answers only while a round is open.
- Only the TV (host) or the dealer can change scores, approvals, pauses and round flow.
- Any player can hit STOP during the fast-or-slow call, but only in their own name.
- Everything outside `rooms` is closed. If the old Expo app shares this Firebase project, its `users` and `leaderboard` collections are blocked too.

## Test before deploying

Needs Java (for the Firestore emulator). From this folder:

```bash
npm install
npm run test:rules
```

Every write the TV and phone apps make has an "allowed" test, and the important abuses have "blocked" tests. All should pass.

## Deploy

```bash
npx firebase login
npx firebase use <your-project-id>
npx firebase deploy --only firestore:rules
```

Or paste `firestore.rules` into Firebase Console > Firestore > Rules and publish.

Deploy the rules **after** both apps are on the version with the fast-or-slow call. Older app versions make writes these rules don't allow.

To undo, publish the previous rules from the console's rules history.
