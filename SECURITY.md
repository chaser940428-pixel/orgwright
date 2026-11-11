# Security

## Reporting a problem

Please don't open a public issue for security problems. Report them privately through GitHub instead:
**[Report a vulnerability](https://github.com/krishnakumar11oct1995-star/orgwright/security/advisories/new)**.

Tell me what you found, how to reproduce it and what it lets someone do. I'll reply within a few days and keep you posted while it's fixed. If you'd like credit, say so and you'll be named in the release notes.

## How the Studio is meant to run

The Studio's local server can run tests and write files on your machine, so it's locked down by default:

- The API listens on `127.0.0.1` and the UI on `localhost`, so other machines on your network can't reach them.
- Browser requests are only accepted from the Studio's own page. Other websites you have open can't call the API or connect to its WebSocket.
- Setting `ORGWRIGHT_HOST=0.0.0.0` exposes the API to your network. Only do that on a network you trust.

Your Salesforce credentials stay out of the repository: logins go through the Salesforce CLI, and `.env`, `.auth/` and the `.orgwright/` caches are git-ignored. Don't commit them, and check screenshots or captured pages for real data before sharing them.

## Supported versions

Only the latest release gets security fixes.
