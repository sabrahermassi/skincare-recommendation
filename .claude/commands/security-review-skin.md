I already have a software security implementation plan for this application.

Do not implement anything and do not modify any files.

Act as a senior software security engineer and critically review my plan.

Your goal is to identify what I may be missing, what risks I may be underestimating, and whether the order and scope of the plan make sense.

Consider the major areas of modern application security, including where relevant:

- Authentication
- Authorization and access control
- User/data isolation
- Input validation
- Injection vulnerabilities
- SQL/NoSQL injection
- XSS
- CSRF
- CORS
- Session and token security
- Password and account recovery security
- API security
- Rate limiting and abuse prevention
- Secrets and credential management
- Sensitive data exposure
- Logging and error handling
- File upload and file handling security
- SSRF
- Path traversal
- Command/code injection
- Dependency and supply-chain security
- Database security
- Encryption in transit and at rest
- Secure configuration
- Least privilege
- Infrastructure and deployment security
- Resource exhaustion / DoS
- Race conditions and concurrency-related security issues
- Security monitoring and auditing
- Security testing
- Backup and recovery considerations
- Privacy and data retention
- Third-party integrations and trust boundaries

Also consider OWASP Top 10 and other commonly recognized application-security risks where relevant.

Given this application handles skin health data — quiz responses, skin type/condition history, uploaded skin photos (if applicable), and personalized product recommendations (see `.claude/claude-security-guidance.md`), weigh
data isolation, sensitive data exposure, and privacy/data retention more heavily than you would for a
non-health app — but do not assume every category applies. Pay particular attention to any photo/image upload
flow, since biometric-adjacent images of a user's skin carry higher sensitivity than typical user content, and to
any third-party product/affiliate data feeds, since those are an external trust boundary. Focus on risks that are
relevant to the actual application and explain why.

For every missing security item, tell me:

- What I am missing
- Why it matters
- What risk it addresses
- Priority: HIGH / MEDIUM / LOW
- Whether it should be added to my plan

Also identify anything in my plan that is:

- redundant
- unnecessarily complex
- too vague
- in the wrong order
- missing an associated security test

Do not implement fixes.
Do not modify files.
Do not create GitHub issues.
Do not commit or push.

At the end, give me a concise list titled:

## Recommended Additions

containing only the security items you believe should actually be added to my plan.

Here is my security plan: read the file at claude-security-guidance.md and treat its contents as the plan.

If that file does not exist or cannot be read, stop and tell me so. Do not invent a plan to review.
