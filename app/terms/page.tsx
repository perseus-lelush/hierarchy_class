import { LegalLayout, LegalSection, LegalList } from "@/components/landing/LegalLayout";
import { APP_VERSION } from "@/lib/version";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms and Conditions" updated="August 18, 2026">
      <LegalSection heading="1. Acceptance of terms">
        <p>
          By creating an account or using Hierarchy Class (v{APP_VERSION}), you agree to these Terms and Conditions.
          If you are under 18, a parent or guardian must review and accept these terms on your behalf. If you do not
          agree, do not use the platform.
        </p>
      </LegalSection>

      <LegalSection heading="2. The service">
        <p>
          Hierarchy Class is a school management and gamified academic tracking platform for College of Saint Amatiel
          (CSA). It provides role-based workspaces for students, teachers, and administrators, including a live rank
          engine, classroom grading, habits, messaging, a school feed, MyDay stories, achievements, notifications, a
          campus currency (Florin) with a shop and wardrobe, and library tools (librarian access only). The platform
          is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo;
        </p>
      </LegalSection>

      <LegalSection heading="3. Accounts and roles">
        <LegalList
          items={[
            "You must provide accurate information when creating an account and keep your credentials secure.",
            "Public signup is available for student and teacher accounts only. Administrator accounts are provisioned by the platform owner and cannot be created through signup.",
            "Email confirmation is required before an account can be used.",
            "Student registrations require your school-issued student ID; teacher registrations require your school-issued faculty ID. These identifiers are stored to verify school membership and must not be shared as passwords.",
            "Role access is enforced by the system from your profile record. Student, teacher, and administrator accounts have different permissions.",
            "You are responsible for all activity that happens under your account.",
            "Administrators manage education levels, programs, sections, courses, seasons, enrollment, and grade approvals. Teachers manage grades and course content for the subjects assigned to them. Students track their rank, habits, and profile.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Academic information, grades, and ranks">
        <LegalList
          items={[
            "Teachers input scores for the activities and categories they configure for their courses.",
            "Approved grades feed the rank engine. Each grade computes its own contribution using its category weight; pending or rejected grades do not affect ranks.",
            "Ranks, bars, and leaderboards are computed from approved data. The EX tier is an open-ended score for Exceptional seasons.",
            "Administrators declare seasons with start and end dates. When a season ends, final and peak ranks are recorded and the ladder resets.",
            "We may correct rank or grade computations if an error is found, without retroactive penalty beyond restoring correct values.",
            "Grade data is only visible to the student it belongs to, their teachers, and their school administrators. Aggregate averages may be shown on leaderboards.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Profiles, stories, achievements, and habits">
        <LegalList
          items={[
            "Profiles include your name, school identifiers, academic level, photo, bio, hobbies, favorite subject, achievements, and music you add.",
            "MyDay stories you publish are visible to your school for a limited time (24 hours by default) and may show who viewed them.",
            "Achievements you upload represent awards you received and are visible to your school.",
            "Habits are personal: your targets, daily logs, and streak history are visible only to you (and to school administrators as needed).",
            "You are responsible for the accuracy of the personal content you add to your profile.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. Messaging and notifications">
        <LegalList
          items={[
            "Messaging is limited to your school. You can block another user and hide conversations.",
            "Message notifications include a link that opens the exact conversation; they are informational and respect your notification preferences.",
            "Notifications for grades, tasks, announcements, and account events help you keep up with school activity.",
            "Do not use messaging to harass, impersonate, or spam other users.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="7. Acceptable use">
        <LegalList
          items={[
            "Do not attempt to access another user's data, another school's data, or any part of the system you are not authorized to see.",
            "Do not post abusive, harassing, defamatory, or unlawful content to the school feed, messages, stories, or materials.",
            "Do not submit fake, misleading, or inflated grades, scores, or habit entries.",
            "Do not attempt to bypass authentication, row-level security, or any other safeguard, and do not attempt to modify your own role or school through client-side tools.",
            "Do not use the platform to violate any law, regulation, or your school's code of conduct.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="8. Security">
        <LegalList
          items={[
            "Your role and school membership are enforced from server-side records; they cannot be changed by editing your profile or browser data.",
            "Report any suspected security issue or unauthorized access immediately through the feedback channel.",
            "Do not share your password, student ID, or faculty ID with anyone.",
            "Suspicious account activity may result in your account being temporarily restricted while it is reviewed (see section 10).",
          ]}
        />
      </LegalSection>

      <LegalSection heading="9. Content you submit">
        <LegalList
          items={[
            "You retain ownership of content you post, including feed posts, stories, materials, messages, and achievements.",
            "You grant the school and the platform a limited license to store, display, and distribute that content within the platform for its intended purpose.",
            "Teachers may remove or edit materials they uploaded. Administrators may moderate feed posts and submitted content.",
            "Deleted messages are removed from view for the conversation participants; history may remain in backups as required by law.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="10. Account restriction, suspension, and appeals">
        <LegalList
          items={[
            "A school administrator may temporarily restrict an account suspected of violating these terms or of unauthorized activity.",
            "A restricted account can still sign in, but only reaches the restriction page, where the notice and the appeal form are shown.",
            "You may submit one appeal at a time explaining why your access should be restored. A school administrator reviews it and may restore access or keep the restriction.",
            "Deactivating your own account is self-service and reversible - you can reactivate anytime.",
            "School administrators cannot deactivate accounts directly; deletion of an account requires an approved deletion request (section 11).",
          ]}
        />
      </LegalSection>

      <LegalSection heading="11. Account deletion requests">
        <LegalList
          items={[
            "To permanently delete your account, submit a deletion request. Nothing is deleted automatically - an administrator reviews and approves or denies the request.",
            "If approved, your account and personal data are removed. School-required academic records may be retained or anonymized for school records, as required by law.",
            "You can download your own data before requesting deletion.",
            "You can stop using the platform at any time without deleting your account.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="12. Feedback and file attachments">
        <LegalList
          items={[
            "Feedback and bug reports may include file attachments (screenshots, images, or PDFs).",
            "Attachments are stored privately, are visible only to you and to school administrators reviewing the report, and are never published publicly.",
            "Do not attach files that contain sensitive personal information, passwords, or content you are not authorized to share.",
            "Attachments are subject to size and file-type limits enforced by the platform.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="13. Privacy">
        <p>
          Your data is handled as described in the Privacy Policy. School administrators can access school data as
          needed to operate the platform, and the platform owner can access data to maintain the service. We do not
          sell your personal data.
        </p>
      </LegalSection>

      <LegalSection heading="14. School administration authority">
        <p>
          CSA administrators manage the school&apos;s use of the platform, including enrollment, grades, seasons,
          announcements, and account reviews. Administrators act within their school only; they cannot manage users
          of other schools. The platform owner provisions administrator accounts and maintains the platform.
        </p>
      </LegalSection>

      <LegalSection heading="15. Intellectual property">
        <p>
          The Hierarchy Class name, logo (crown mark), design, and software are the property of the project. You may
          not copy, redistribute, or reverse engineer the platform without permission.
        </p>
      </LegalSection>

      <LegalSection heading="16. Availability and liability">
        <LegalList
          items={[
            "We do not guarantee uninterrupted availability. Maintenance and outages may occur.",
            "To the maximum extent permitted by law, the platform is not liable for indirect, incidental, or consequential damages.",
            "Educational decisions remain the responsibility of the school. The platform is a tool, not a substitute for academic judgment.",
            "If a bug affects grades, ranks, or enrollment, we will work to correct the data and notify the affected school.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="17. Changes to the service and these terms">
        <LegalList
          items={[
            "We may update the platform and these terms from time to time. Continued use of the platform after changes take effect means you accept the updated terms.",
            "The date at the top of this page reflects the latest revision.",
            "Features that are no longer supported may be removed; we will keep these terms accurate to the current system.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="18. Contact">
        <p>
          Questions about these terms can be directed to the project maintainer at{" "}
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
