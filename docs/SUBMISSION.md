# Final submission checklist

1. Run `npm ci`, install Chromium, and run `npm test` on your machine.
2. Set your API key privately and follow the genuine discovery commands in README.
3. Inspect `evidence/capability.json` and logs. Keep the live discovery, successful replay, and exceptional replay. Do not replace them with offline logs.
4. Perform the interactive session-expiry demo yourself. Inspect the human action events.
5. Run `npm run check:submission`. It must pass, but manual review still matters.
6. Update `evidence/STATUS.md` to describe only what you actually ran. Keep the synthetic/offline provenance explicit.
7. Read REPORT and rehearse DEFENSE. Adjust any design explanation you disagree with or cannot defend.
8. Inspect all tracked files for secrets, member values, hidden files and unreviewed logs. `.env` and node_modules must not be tracked. The provided synthetic sample values are not real PII.
9. Create a public GitHub repository and push this directory as its root. With GitHub CLI installed/authenticated:

```bash
git init
git add .
git commit -m "Implement guarded computer-use discovery and replay"
gh repo create handrail-computer-use --public --source=. --remote=origin --push
```

If already in a repository, use its existing remote instead. Confirm the public URL in a signed-out browser and check CI. Do not publish before you review the project.

10. Send the repository URL to assignments@interface.ai from the address you applied with. The URL must be on its own line. Do not send the zip.

Suggested email:

Subject: Applied AI Engineer Assignment — Chakradhar Reddy Nallu

Hi interface.ai Recruiting Team,

Please find my Computer-Use Automation System assignment here:

https://github.com/chakradharreddynallu/handrail-computer-use

The repository includes setup and demo commands, the design report, tests, and discovery/replay evidence.

Thank you for reviewing my submission.

Best,
Chakradhar Reddy Nallu

Send this only after the evidence and public repository are complete.
