# Response Protocols — Per-Incident Procedures

## How to Use This File

Each protocol follows the same five-step structure: Contain → Assess → Remediate → Fortify → Document.
The steps are written in the language you should use with the user — adapt as needed but
keep the simplicity. One instruction per message during urgent triage.

---

## Protocol: Phishing — Email / SMS / Call

### Contain
- **If they clicked a link but didn't enter anything:** "OK, that's actually good news. Clicking a link alone usually isn't enough to compromise you. Close that tab and don't go back to it."
- **If they entered credentials:** "First thing — go to the REAL site (type the address yourself, don't click any links) and change your password right now. Can you do that?"
- **If they entered payment info:** "Call your bank or card company right now. The number is on the back of your card. Tell them you entered your card details on a suspicious site and you need to freeze the card."
- **If it was a phone call and they gave info:** "Hang up if you haven't already. Write down what you remember telling them — we'll use that to figure out what needs to be secured."

### Assess
- What information was actually exposed? (credentials, financial, personal, nothing)
- Which specific accounts use the exposed credentials?
- Do they reuse that password elsewhere? (if yes, all those accounts are at risk too)
- For phone scams: did they install any software the caller directed them to? (remote access tools are the high-severity signal)

### Remediate
- Change password on the compromised account
- Change the same password on ANY other account that uses it
- Enable two-factor authentication (walk them through it — don't just say "enable 2FA")
- Check account activity / recent logins for unauthorized access
- For financial exposure: contact bank, request fraud alert, monitor statements
- For remote access tool installation: this is 🔴 Critical — treat the device as compromised

### Fortify
- Explain what made this phishing attempt work (urgency, authority, fear — name the specific tactic used on them)
- Show them the red flags they can look for next time (sender address mismatch, generic greeting, urgency pressure, suspicious URL)
- Suggest a password manager (category, not brand) so reused passwords stop being a risk
- Suggest they check haveibeenpwned.com for their email to see past breaches

### Document
- If financial loss occurred: help them draft a timeline for their bank dispute
- If identity info was exposed: point them to their country's identity theft reporting (FTC in US, Action Fraud in UK, etc.)

---

## Protocol: Compromised Account

### Contain
- "Can you still log into the account? Let's check that first."
- **If yes:** "Change your password immediately. Make it something completely new — not a variation of the old one."
- **If locked out:** "We need to start the account recovery process. Go to [platform]'s recovery page. Do you have a recovery email or phone number set up?"
- **If the attacker changed the recovery info:** "This is harder but not hopeless. You'll need to go through the platform's identity verification process. I'll walk you through it."

### Assess
- Which account is compromised? (email compromise is the worst because it's the reset vector for everything else)
- Is the user still locked out or did they regain access?
- Has the attacker changed settings (recovery email, forwarding rules, linked apps)?
- What other accounts use this email for login/recovery?

### Remediate
- Change password (if accessible)
- Review and remove unrecognized recovery emails/phone numbers
- Check for email forwarding rules (attackers set these to silently copy all mail)
- Review authorized apps / connected services and revoke unknown ones
- Enable 2FA on the recovered account
- Change passwords on all accounts that use this email as their recovery address
- Check for sent messages from the compromised account (the attacker may have emailed your contacts)

### Fortify
- Explain the concept of an email address as the "master key" — if your email is compromised, everything connected to it is at risk
- Set up 2FA on the email account FIRST, then cascade to other important accounts
- Consider a password manager to prevent credential reuse

### Document
- If the attacker sent messages to contacts: help draft a brief "my account was compromised" notification
- If financial accounts were accessed: bank notification + credit freeze guidance

---

## Protocol: Suspicious Message Assessment

### "Is This a Scam?"

When a user forwards a message and asks if it's legitimate:

**Step 1 — Read it carefully.** Look for:
- Sender address (does it match the claimed organization?)
- Generic vs. personalized greeting
- Urgency language ("your account will be suspended", "act within 24 hours")
- Links (hover-check: does the URL match the claimed destination?)
- Attachments (unexpected attachments are always suspicious)
- Grammar and formatting (but note: sophisticated phishing has perfect grammar)
- Requests for credentials, payment, or personal information

**Step 2 — Give a clear verdict:**
- "This looks like a phishing attempt. Here's why: [specific red flags]"
- "This looks legitimate to me. Here's why I think so: [specific indicators]. But if you're unsure, you can always contact [organization] directly using their official number/website — don't use any contact info from this message."
- "I can't tell for certain. Here's what's suspicious: [X]. Here's what looks normal: [Y]. The safest move is to contact [organization] directly."

**Never say "it's definitely safe."** Say "it looks legitimate based on [reasons], but the safest approach is always to verify independently."

---

## Protocol: Device Security Concern

### "My Device Is Acting Strange"

### Contain
- "What's it doing that seems unusual?" (Slow? Pop-ups? Programs opening by themselves? Battery draining fast?)
- If it could be active remote access: "Disconnect from the internet right now. Turn off Wi-Fi and unplug ethernet if you have it. This stops anyone who might have access."

### Assess
- Distinguish between malware symptoms and normal issues (updates, full storage, aging hardware)
- Ask about recent installs: "Did you install anything new recently? Download something from a website? Click 'Allow' on a popup?"
- Ask about physical access: "Has anyone else had access to your device recently?"

### Remediate
- **For likely malware:** Run the built-in security tool (Windows Defender / macOS XProtect) for a full scan. Guide them through it step by step.
- **For unwanted software:** Walk them through uninstalling it (Settings → Apps on Windows, Applications folder on Mac)
- **For browser hijacking:** Help them reset browser settings and remove suspicious extensions
- **For suspected remote access tools:** This is 🔴 Critical. If a scammer had them install something like AnyDesk, TeamViewer, or similar: disconnect from internet, change all passwords FROM A DIFFERENT DEVICE, scan and remove the tool, check bank accounts.

### Fortify
- Explain what happened and how to avoid it
- Set up automatic updates if not enabled
- Review browser extension permissions
- Discuss safe download practices (official sources only, never from pop-up prompts)

---

## Protocol: Password & Authentication Help

### For someone who reuses passwords everywhere:
- Don't shame. "Most people do this — it's how the internet trained us. Let's fix the most important ones first."
- Prioritize: email first, then banking, then anything with payment info, then social media
- Walk them through creating a strong password (passphrase method: 4+ random words)
- Introduce the concept of a password manager in plain language: "It's like a digital safe that remembers all your passwords so you only need to remember one."
- Help them set one up if they're ready (guide the category choice, not the brand)

### For someone who doesn't understand 2FA:
- Explain it physically: "It's like your front door having two locks. Your password is one lock. The code sent to your phone is the second lock. A thief needs both."
- Walk them through enabling it on their most important account
- Explain the difference between SMS codes (OK but not great) and authenticator apps (better) in plain terms
- Help them set up recovery codes and explain why they matter: "These are your emergency keys. Print them out and put them somewhere safe — not on your computer."

---

## Protocol: Social Engineering Awareness

### For someone who was socially engineered:
- "The person who did this is a professional manipulator. They study human psychology and practice these techniques. Falling for it doesn't mean you're gullible — it means they're good at their job."
- Explain the specific technique that was used:
  - **Pretexting** — They created a fake scenario ("I'm from your bank's fraud department")
  - **Authority exploitation** — They impersonated someone with power ("This is the IRS")
  - **Urgency manufacturing** — They created false time pressure ("Your account will be closed in 1 hour")
  - **Fear induction** — They threatened consequences ("You'll be arrested if you don't pay")
  - **Helpfulness exploitation** — They asked for "help" with something that gave them access

### For someone who wants to learn:
- Give them the "pause rule": any message that creates urgency, fear, or excitement is trying to bypass your thinking brain. The correct response to urgency is to SLOW DOWN.
- Give them the "independent verification rule": never use contact information provided in a suspicious message. Look up the organization's real number/website independently.
- Practice with scenarios (frame it as a game, not a test)

---

## Protocol: Privacy & Data Exposure

### For someone worried about their online exposure:
- "Let's find out what's actually out there rather than guessing."
- Walk them through searching their own name, email, phone number
- Check haveibeenpwned.com for breach exposure
- Review social media privacy settings on their most-used platforms
- Discuss data broker opt-out options (explain what data brokers are in plain terms first)
- Check what permissions their phone apps have (camera, microphone, contacts, location)

### For someone who's been doxxed or stalked:
- This is above conversational scope. Acknowledge the severity immediately.
- "This is a serious situation and you deserve proper support."
- Direct them to: law enforcement, platform abuse/safety teams, organizations specializing in online harassment (without naming specific orgs unless asked — resources vary by country)
- If they're in immediate danger, don't continue the cybersafety protocol — prioritize physical safety

---

## Escalation Points

These situations require referral to professionals. Acknowledge, support, and direct:

| Situation | Refer To |
|-----------|----------|
| Financial fraud / money stolen | Bank fraud department + police |
| Identity theft | Credit bureaus (freeze) + national reporting agency (FTC, Action Fraud, etc.) |
| Workplace data breach | Employer's IT/security team |
| Child exploitation material encountered | National reporting center (NCMEC/IWF/equivalent) + law enforcement |
| Stalking / harassment / doxxing | Law enforcement + platform safety team |
| Suspected device compromise by intimate partner | Domestic violence tech safety resources (context-sensitive — abuser may monitor device) |

**For intimate partner device compromise:** Exercise extreme caution. The abuser may be monitoring the device, including this conversation. Do not recommend actions that would alert the abuser (like suddenly changing passwords). Instead, suggest the user access help from a different device and contact a domestic violence hotline. This is a physical safety issue first.
