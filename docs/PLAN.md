# Ugo: Project Plan

> This was the first planning note. The build now follows the full Ugo brief: see [STATUS.md](STATUS.md) for where things stand and [ARCHITECTURE.md](ARCHITECTURE.md) for how it is built. The backend choice below was settled as NestJS with PostgreSQL on AWS.

Ugo is an exam prep and study hub mobile app for school kids and students. It will be built with Expo and React Native so that one codebase runs on Android and iOS.

This plan sets out what we are building, how we will build it and the order in which the work will be done. It is a living document and should be updated as decisions change.

## 1. Vision and goals

Many students prepare for exams with scattered notes, old past questions and very little feedback on how they are doing. Ugo brings all of that into one place on the phone they already carry.

Goals for the first release:

- Let students practise past questions and mock exams by subject and topic.
- Give instant feedback with correct answers and short explanations.
- Track progress so students can see their weak topics and improve on them.
- Work well on low cost Android phones and on poor or no internet connection.
- Be safe and simple enough for younger students to use.

## 2. Target users

| User | Needs |
| --- | --- |
| Secondary school students | Past questions, mock exams, topic practice, progress tracking |
| Primary school pupils | Simple quizzes, bright and friendly interface, short sessions |
| University and pre university students | Flashcards, study notes, timed tests |
| Parents and guardians (later phase) | A view of their child's progress |
| Teachers (later phase) | Create and share quizzes with a class |

## 3. Core features

### MVP (Phase 1)

1. **Onboarding and accounts**: sign up with email or phone, choose level (primary, secondary, tertiary), choose exams and subjects of interest.
2. **Question bank**: browse by exam, subject, year and topic. Support multiple choice, true or false and short answer questions, with optional images.
3. **Practice mode**: answer questions one at a time with instant feedback and an explanation for each answer.
4. **Mock exam mode**: timed tests that copy the real exam format, with a score summary at the end.
5. **Progress dashboard**: scores per subject and topic, streaks and a list of weak topics to revisit.
6. **Bookmarks**: save hard questions to review later.
7. **Offline support**: download subject packs and practise without internet. Results sync when the device is back online.

### Phase 2

- Flashcards with spaced repetition.
- Study notes and short topic summaries.
- Study planner with exam countdown and daily reminders (push notifications).
- Leaderboards and badges to keep students motivated.
- Dark mode and font size settings for accessibility.

### Phase 3

- Parent and teacher accounts with progress reports.
- Teacher created quizzes shared by class code.
- AI study helper that explains a question in simpler words (with clear safety rules for young users).
- Premium subscription for full mock exams and extra content.

## 4. Tech stack

| Area | Choice | Reason |
| --- | --- | --- |
| Framework | Expo (latest stable SDK) with React Native | One codebase for Android and iOS, fast development, over the air updates |
| Language | TypeScript | Fewer bugs and better editor support |
| Navigation | Expo Router (file based routing) | Simple structure that matches the folder layout |
| Server state | TanStack Query | Caching, retries and background refresh |
| Local state | Zustand | Small and easy to understand |
| Offline storage | expo-sqlite | Stores downloaded question packs and pending results |
| Secure storage | expo-secure-store | Keeps auth tokens safe on the device |
| Backend | Supabase (Postgres, Auth, Storage) or Firebase | Managed auth and database so we can focus on the app. Final choice to be made before Phase 1 starts |
| Styling | NativeWind (Tailwind for React Native) or StyleSheet with a shared theme | Consistent design tokens |
| Forms and validation | React Hook Form with Zod | Typed, simple form handling |
| Notifications | expo-notifications | Study reminders and exam countdowns |
| Testing | Jest, React Native Testing Library, Maestro for end to end flows | Confidence before each release |
| Builds and releases | EAS Build, EAS Submit, EAS Update | Cloud builds, store submission and quick fixes without a new store release |
| Monitoring | Sentry | Crash and error reporting |

## 5. Project structure

```
ugo/
  app/                    # Expo Router screens
    (auth)/               # sign in, sign up, onboarding
    (tabs)/               # main tab bar
      index.tsx           # home / dashboard
      practice.tsx        # subjects and topics
      exams.tsx           # mock exams
      progress.tsx        # stats and weak topics
      profile.tsx         # settings and account
    quiz/[sessionId].tsx  # question player
    _layout.tsx
  src/
    components/           # shared UI components
    features/             # feature modules (quiz, progress, auth, bookmarks)
    services/             # API clients and sync logic
    db/                   # SQLite schema and queries
    store/                # Zustand stores
    theme/                # colours, spacing, typography
    utils/
  assets/                 # images, fonts, icons
  docs/                   # project documentation (this file)
  app.config.ts
  eas.json
```

## 6. Data model (first draft)

- **User**: id, name, level, school (optional), selected exams and subjects.
- **Exam**: id, name, country or board, format (number of questions, time limit).
- **Subject**: id, name, exam ids.
- **Topic**: id, subject id, name.
- **Question**: id, topic id, exam id, year, type, body, options, correct answer, explanation, image url.
- **Attempt**: id, user id, mode (practice or mock), started at, finished at, score.
- **Answer**: attempt id, question id, chosen answer, is correct, time taken.
- **Bookmark**: user id, question id.

## 7. Offline and sync approach

1. Students download a subject pack, which is stored in SQLite on the device.
2. All practice and mock attempts are saved locally first.
3. A sync queue sends pending attempts to the backend when the device is online.
4. Content packs carry a version number so the app can fetch updates only when something has changed.

## 8. Safety, privacy and accessibility

- Collect only the data we need. No public profiles for users under the required age.
- Follow child privacy rules in the countries we launch in, and get parental consent where the law requires it.
- No open chat between students in the early phases.
- Support screen readers, large text and good colour contrast.
- Keep the app light so it runs well on older Android phones with little storage.

## 9. Milestones

| Milestone | Scope | Rough duration |
| --- | --- | --- |
| M0: Setup | Expo project, TypeScript, linting, Expo Router, theme, EAS config, CI | 1 week |
| M1: Auth and onboarding | Sign up, sign in, level and subject selection | 2 weeks |
| M2: Question bank and practice | Browse content, question player, feedback and explanations | 3 weeks |
| M3: Mock exams and progress | Timed tests, results screen, progress dashboard, bookmarks | 3 weeks |
| M4: Offline mode | SQLite storage, pack downloads, sync queue | 2 weeks |
| M5: Beta | Internal testing, closed beta with a small group of students, bug fixes | 2 weeks |
| M6: Launch | Store listings, Play Store and App Store release | 1 week |

## 10. Success measures

- Students complete at least three practice sessions in their first week.
- Seven day retention above 30 percent during the beta.
- Crash free sessions above 99 percent.
- App size small enough to install on low storage phones.

## 11. Risks and open questions

- **Content**: where will past questions come from, and do we have the rights to use them?
- **Backend choice**: Supabase or Firebase. This needs a decision before M1.
- **Exam coverage**: which exams and countries do we support first?
- **Monetisation**: free with ads, subscription, or school licences?
- **Moderation**: how do we review content added by teachers in Phase 3?

## 12. Next steps

1. Confirm the first exams and subjects to support.
2. Choose the backend and set up the project.
3. Create the Expo app and complete Milestone M0.
4. Gather a first batch of questions for one subject to test the question player.
5. Design the main screens (home, practice, question player, results, progress).
