import { LegalLayout, LegalSection, LegalList } from "@/components/landing/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="August 15, 2026">
      <LegalSection heading="1. What we collect">
        <LegalList
          items={[
            "Account information: name, email address, school, role, and password (stored securely through our authentication provider).",
            "Academic data: courses, grades, scores, category weights, rank state, and rank history generated from approved grades.",
            "Activity data: habit entries, attendance, stories, feed posts, messages, materials, and notifications.",
            "Technical data: browser type and basic usage information needed to operate the service.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="2. How we use your data">
        <LegalList
          items={[
            "To provide the service: authenticate you, load your dashboards, compute ranks, and deliver realtime updates.",
            "To support teaching: show teachers the grades they entered and the students in their courses.",
            "To support administration: let school admins manage enrollment, programs, seasons, and content.",
            "To improve the product and fix bugs or security issues.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Who can see what">
        <LegalList
          items={[
            "Students can see their own grades, rank, habits, and profile.",
            "Teachers can see grades and profiles for students in the courses assigned to them, plus class averages.",
            "Administrators can see school-wide data, including rank distributions and enrollment.",
            "Individual grade scores are never shared publicly. Leaderboards show only aggregate averages and ranks.",
            "Messages are visible only to the participants of the conversation.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. How we protect your data">
        <LegalList
          items={[
            "Authentication is handled by a managed auth provider with secure password hashing.",
            "Access to data is enforced by row-level security at the database level, scoped to your school and role.",
            "Realtime subscriptions are filtered to the data you are allowed to see.",
            "We follow the principle of least privilege: no user can query another school's data through the application.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Data retention">
        <LegalList
          items={[
            "Your account and its data remain stored while the account is active.",
            "Deleted messages are removed from the active conversation view.",
            "Rank history and grade records may be retained to support seasons, reporting, and audit purposes as required by the school.",
            "If your account is removed by an administrator, we will delete or anonymize your personal data where feasible.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. Your rights">
        <LegalList
          items={[
            "Access: view your account and academic data inside the app.",
            "Correction: request fixes for incorrect grades, enrollment, or profile information through your teacher or administrator.",
            "Deletion: request removal of your account and personal data where permitted by law.",
            "Export: ask your administrator for a copy of your data if your school provides it.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="7. Children and students">
        <p>
          The platform is used in a school context. Where students under 18 use the service, the school acts as the
          educational institution responsible for consent and oversight, consistent with applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="8. Third parties">
        <p>
          We use a managed authentication and database provider (Supabase) and a hosting provider for the application.
          These providers process data only to operate the service and are bound by their own security commitments.
          We do not sell your personal data.
        </p>
      </LegalSection>

      <LegalSection heading="9. Security incidents">
        <p>
          If a data breach affects your information, we will notify the affected school and work to secure the system
          promptly.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to this policy">
        <p>
          We may update this policy as the service evolves. The date at the top of this page reflects the latest
          revision, and continued use after changes means you accept the updated policy.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact">
        <p>
          Questions about this policy can be directed to the project maintainer at{" "}
          <a
            href="https://github.com/perseus-lelush"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--accent)] underline underline-offset-2"
          >
            github.com/perseus-lelush
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
