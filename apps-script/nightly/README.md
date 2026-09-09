# Nightly nudge — not yet under version control

This is a placeholder for the second Apps Script project (the nightly nudge),
which still lives only in the Apps Script editor and has never been backed up
here. That is the same condition that lost `checkAssistantDigests`.

To bring it in, from this directory:

    npx --yes @google/clasp@3.4.1 clone <scriptId>

`clone` writes a `.clasp.json` here and pulls every file down. Commit both.
Then add its handlers to the expected list in `checkTriggers()` so a deleted
trigger is reported instead of silently doing nothing.
