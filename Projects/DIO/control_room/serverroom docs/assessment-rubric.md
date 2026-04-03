# Assessment Rubric — Personal Security Scorecard

## How to Use This File

During Adaptive Protocol assessments, use this rubric to score each domain and generate
the Personal Security Scorecard. The scorecard should feel empowering, not alarming —
frame gaps as opportunities, not failures.

## Scoring Scale

| Score           | Label | Meaning                                              |
| --------------- | ----- | ---------------------------------------------------- |
| ✅ Strong       | 4     | Good practices in place, minor improvements possible |
| 🟡 Fair         | 3     | Some protection, but meaningful gaps exist           |
| 🟠 Weak         | 2     | Significant exposure, needs attention soon           |
| 🔴 Critical     | 1     | Actively at risk, prioritize immediately             |
| ⬜ Not Assessed | —     | User chose to skip or domain not applicable          |

## Domain Scoring Criteria

### 1. Accounts & Authentication

| Score       | Criteria                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| ✅ Strong   | Unique passwords per account, password manager in use, 2FA on critical accounts, recovery options configured |
| 🟡 Fair     | Some unique passwords, 2FA on email at least, knows about password managers but doesn't use one              |
| 🟠 Weak     | Reuses passwords across some accounts, no 2FA, relies on memory for passwords                                |
| 🔴 Critical | Same password everywhere, no 2FA, passwords are simple/guessable, email account has no extra protection      |

**Key questions to ask:**

- "Do you use the same password for more than one account?"
- "Do you use a password manager or keep them in your head (or a note)?"
- "Have you set up that thing where you get a code on your phone when you log in?" (2FA — phrase it before naming it)
- "If you got locked out of your email right now, how would you get back in?"

### 2. Device Security

| Score       | Criteria                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| ✅ Strong   | OS auto-updates enabled, screen lock with biometric/strong PIN, disk encryption on, no unnecessary admin privileges |
| 🟡 Fair     | Updates happen but may be delayed, screen lock active, no encryption awareness                                      |
| 🟠 Weak     | Updates frequently postponed, weak/no screen lock, admin account used for daily tasks                               |
| 🔴 Critical | OS significantly outdated, no screen lock, unknown software installed, device shared without separate accounts      |

**Key questions to ask:**

- "Does your computer install updates on its own, or do you have to click something?"
- "If someone picked up your phone right now, could they get in?"
- "Do you know if your laptop's hard drive is encrypted?" (most people won't — that's fine, just assess)
- "Do other people use your computer? Do they have their own login?"

### 3. Phishing Awareness

| Score       | Criteria                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| ✅ Strong   | Can identify common phishing tactics, verifies independently before acting, doesn't click links in unsolicited messages |
| 🟡 Fair     | Generally cautious but might fall for well-crafted attempts, sometimes clicks links to "check"                          |
| 🟠 Weak     | Relies on gut feeling, has clicked suspicious links before, doesn't check sender addresses                              |
| 🔴 Critical | Has been phished before and didn't realize it, clicks links freely, trusts caller ID / sender name at face value        |

**Assessment method:**
Give them a brief scenario (with their permission — frame it as practice, not a test):
"If you got an email from your bank saying 'unusual activity detected, click here to verify your account' — what would you do?"

Score based on their response:

- ✅ "I'd call my bank using the number on my card / go to their website directly"
- 🟡 "I'd look at the email carefully to see if it's real"
- 🟠 "I might click it if it looked official"
- 🔴 "I'd click the link and log in to check"

### 4. Social Engineering Awareness

| Score       | Criteria                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| ✅ Strong   | Understands manipulation tactics, has a "pause and verify" habit, skeptical of unsolicited contact           |
| 🟡 Fair     | Generally cautious with strangers but might be swayed by authority figures or urgency                        |
| 🟠 Weak     | Tends to comply with requests from perceived authority, doesn't question urgency                             |
| 🔴 Critical | Has given sensitive info to callers/messagers claiming to be from organizations, trusts unsolicited contacts |

**Key questions to ask:**

- "Have you ever gotten a call from someone claiming to be from your bank, the government, or a tech company?"
- "What did you do?" (listen for whether they verified independently)
- "If someone called right now saying they're from Microsoft and your computer has a virus, what would you do?"

### 5. Browsing & Download Habits

| Score       | Criteria                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| ✅ Strong   | Downloads only from official sources, reviews permissions, uses ad-blocker, checks URLs before entering credentials        |
| 🟡 Fair     | Generally careful but occasionally downloads from unfamiliar sites, has some unnecessary browser extensions                |
| 🟠 Weak     | Installs software from various sources, clicks through permission prompts, many browser extensions                         |
| 🔴 Critical | Downloads from pop-ups or ads, installs anything that promises to "speed up" or "clean" their computer, doesn't check URLs |

**Key questions to ask:**

- "When you need to install a new program, where do you get it?"
- "Do you have browser extensions? Do you know what they do?"
- "When a website asks for permission (notifications, location, camera) — what do you usually click?"

### 6. Privacy & Data Exposure

| Score       | Criteria                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Strong   | Privacy settings reviewed, minimal personal info publicly visible, aware of data broker exposure, cautious with app permissions |
| 🟡 Fair     | Some privacy settings configured, but hasn't done a comprehensive review, app permissions mostly default                        |
| 🟠 Weak     | Default privacy settings on most platforms, personal info easily findable online, grants most app permissions                   |
| 🔴 Critical | Profiles fully public, personal info (address, phone, workplace) easily searchable, no awareness of data exposure               |

**Key questions to ask:**

- "If I searched your full name online, what would I find?"
- "Have you looked at the privacy settings on your social media accounts?"
- "Do you know which apps on your phone can access your camera, microphone, or contacts?"

### 7. Backup & Recovery

| Score       | Criteria                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| ✅ Strong   | Regular automated backups (cloud or external), recovery plan for key accounts, recovery codes stored securely |
| 🟡 Fair     | Some files backed up but inconsistently, knows how to recover main accounts, no recovery codes saved          |
| 🟠 Weak     | Important files only on one device, no backup routine, unsure about account recovery                          |
| 🔴 Critical | No backups at all, would lose everything if device failed, no recovery path for important accounts            |

**Key questions to ask:**

- "If your computer stopped working right now and couldn't be fixed — what would you lose?"
- "Do you have copies of your important files somewhere else? (cloud, external drive, another device)"
- "If you got locked out of your email, do you have a way to get back in?"

---

## Scorecard Output Format

After assessment, produce a scorecard that looks like this:

```
🛡️ Your Personal Security Scorecard

| Area | Score | Priority Action |
|------|-------|-----------------|
| Accounts & Auth | 🟠 Weak | Set up 2FA on your email this week |
| Device Security | 🟡 Fair | Enable automatic updates |
| Phishing Awareness | ✅ Strong | — |
| Social Engineering | 🟡 Fair | Practice the "pause and verify" rule |
| Browsing & Downloads | 🟠 Weak | Review and remove unused browser extensions |
| Privacy | 🔴 Critical | Review social media privacy settings today |
| Backup & Recovery | 🟠 Weak | Set up cloud backup for photos and documents |

Your top 3 priorities (highest impact, lowest effort):
1. [specific action with brief walkthrough]
2. [specific action with brief walkthrough]
3. [specific action with brief walkthrough]
```

**Scorecard principles:**

- Lead with strengths ("Your phishing awareness is strong — that's a real asset")
- Frame weaknesses as fixable ("Your privacy settings need work, and the good news is this takes about 15 minutes to fix")
- Prioritize by impact × ease — the user is more likely to act on quick wins
- Offer to walk them through any action item right now
- Never present the scorecard as a grade or judgment — it's a map, not a report card
