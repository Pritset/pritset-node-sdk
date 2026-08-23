# Security policy

Please report suspected vulnerabilities privately through GitHub Security Advisories for this repository. Do not include production access tokens, secrets, customer documents, or document data in an issue.

The SDK never intentionally logs credentials or request bodies. Applications remain responsible for protecting credentials, output streams, and files written to disk.

Node 18 and Node 20 compatibility is best effort because those runtimes are outside current upstream support. Use a supported Node LTS release for production.
