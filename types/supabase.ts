export type Role = "student" | "teacher" | "admin";

// ============================================================================
// ROW TYPES (what you read from the DB)
// ============================================================================

export interface SchoolRow {
  id: string;
  name: string;
  abbreviation: string;
  active: boolean;
  registration_enabled: boolean;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  user_id: string | null;
  school_id: string;
  role: Role;
  full_name: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  /** School-issued student identifier (unique within the school, NOT the auth user UUID). */
  student_id: string | null;
  /** School-issued faculty identifier (unique within the school). */
  faculty_id: string | null;
  level_label: string | null;
  section: string | null;
  educational_level: string | null;
  program: string | null;
  initials: string | null;
  bio: string | null;
  overall_rank: string;
  academic_excellence: number;
  favorite_subject: string | null;
  tags: string[];
  hobbies: string[];
  interests: string[];
  is_librarian: boolean;
  avatar_url: string | null;
  /** User privacy: other students see a limited profile card when true. */
  profile_private: boolean;
  /** User privacy: hides this user's friend list from other students. */
  friends_private: boolean;
  /** User privacy: hides this student's rank history from other students. */
  history_private: boolean;
  /** Last self-service display-name change (renames limited to 1 per 30 days). */
  name_changed_at: string | null;
  deactivated_at: string | null;
  /** Set by a school admin to temporarily restrict a suspicious account.
   *  Distinct from deactivated_at (self-service). Restricted users can only
   *  reach /auth/restricted and may appeal. */
  restricted_at: string | null;
  created_at: string;
}

export interface LearningMaterialRow {
  id: string;
  school_id: string;
  title: string;
  subject: string;
  level_label: string | null;
  type: string;
  uploaded_by: string;
  upload_date: string;
  description: string | null;
  url: string | null;
  created_at: string;
}

export interface LibraryBookRow {
  id: string;
  school_id: string;
  title: string;
  author: string;
  genre: string;
  status: string;
  borrowed_by: string | null;
  borrowed_by_name: string | null;
  borrowed_date: string | null;
  due_date: string | null;
  created_at: string;
}

export interface LibraryBorrowRequestRow {
  id: string;
  school_id: string;
  book_id: string;
  student_id: string;
  status: string;
  pickup_window: string | null;
  requested_at: string;
}

export interface LibraryBorrowLogRow {
  id: string;
  school_id: string;
  book_id: string;
  student_id: string;
  action: string;
  date: string;
}

export interface QuizRow {
  id: string;
  school_id: string;
  title: string;
  subject: string;
  level_label: string | null;
  time_limit_seconds: number;
  created_by: string;
  created_at: string;
}

export interface QuizQuestionRow {
  id: string;
  quiz_id: string;
  question: string;
  options: string[];
  correct_index: number;
  created_at: string;
}

export interface QuizAttemptRow {
  id: string;
  school_id: string;
  student_id: string;
  quiz_id: string;
  score: number;
  total: number;
  completed_at: string;
}

export interface ConversationRow {
  id: string;
  school_id: string;
  participant_id: string;
  other_user_id: string;
  role: string;
  last_message: string | null;
  last_read_at: string | null;
  created_at: string;
}

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  from_id: string | null;
  from_name: string;
  text: string;
  created_at: string;
}

export interface FriendsRow {
  id: string;
  school_id: string;
  user_a_id: string;
  user_b_id: string;
  created_at: string;
}

export interface SchoolFeedPostRow {
  id: string;
  school_id: string;
  tag: string;
  title: string;
  body: string;
  image_url: string | null;
  author_id: string | null;
  author_name: string | null;
  audience: "everyone" | "students" | "teachers";
  image_path: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface BannerConfigRow {
  school_id: string;
  image_url: string | null;
  focal_y: number;
  updated_at: string;
}

export interface FlorinBalanceRow {
  student_id: string;
  balance: number;
  updated_at: string;
}

export type FlorinTransactionRow = {
  id: string;
  school_id: string;
  student_id: string;
  amount: number;
  reason: string | null;
  created_at: string;
};

// Payment system types
export interface FlorinPackageRow {
  id: string;
  name: string;
  florin_amount: number;
  price_php: number;
  currency: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PaymentTransactionRow {
  id: string;
  student_id: string;
  school_id: string;
  package_id: string;
  florin_amount: number;
  amount_php: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired';
  provider: string;
  provider_session_id: string | null;
  provider_payment_id: string | null;
  reference_number: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  failure_reason: string | null;
}

export interface ProcessedWebhookEventRow {
  id: string;
  provider: string;
  event_id: string;
  transaction_id: string | null;
  processed_at: string;
}


export interface ProgramRow {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface SectionRow {
  id: string;
  school_id: string;
  program_id: string;
  name: string;
  created_at: string;
}

export interface CourseRow {
  id: string;
  school_id: string;
  section_id: string;
  name: string;
  code: string | null;
  teacher_id: string | null;
  created_at: string;
}

export interface CourseEnrollmentRow {
  id: string;
  school_id: string;
  course_id: string;
  student_id: string;
  created_at: string;
}

export interface GradeEntryRow {
  id: string;
  school_id: string;
  course_id: string;
  student_id: string;
  submitted_by: string;
  type: "Exam" | "Quiz" | "Activity" | "Assignment";
  label: string | null;
  score: number;
  entry_date: string;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface TeacherTaskRow {
  id: string;
  school_id: string;
  teacher_id: string;
  assigned_by: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: "pending" | "accepted" | "declined" | "done";
  decline_reason: string | null;
  created_at: string;
}

// ============================================================================
// INSERT TYPES (for creating new rows)
// ============================================================================

export type SchoolInsert = Omit<SchoolRow, "id" | "created_at" | "registration_enabled"> & {
  id?: string;
  created_at?: string;
  /** Defaults to true in the database - the platform owner flips it off to close a school. */
  registration_enabled?: boolean;
};

export type ProfileInsert = {
  user_id: string;
  school_id: string;
  role: Role;
  full_name: string;
  middle_name?: string | null;
  student_id?: string | null;
  faculty_id?: string | null;
  level_label?: string | null;
  section?: string | null;
  initials?: string | null;
  bio?: string | null;
  overall_rank?: string;
  academic_excellence?: number;
  favorite_subject?: string | null;
  tags?: string[];
  hobbies?: string[];
  interests?: string[];
  is_librarian?: boolean;
};

export type LearningMaterialInsert = {
  school_id: string;
  title: string;
  subject: string;
  level_label?: string | null;
  type: string;
  uploaded_by: string;
  upload_date?: string;
  description?: string | null;
  url?: string | null;
};

export type LibraryBookInsert = {
  school_id: string;
  title: string;
  author: string;
  genre: string;
  status?: string;
  borrowed_by?: string | null;
  borrowed_by_name?: string | null;
  borrowed_date?: string | null;
  due_date?: string | null;
};

export type LibraryBorrowRequestInsert = Omit<LibraryBorrowRequestRow, "id" | "requested_at"> & {
  id?: string;
  requested_at?: string;
};

export type LibraryBorrowLogInsert = Omit<LibraryBorrowLogRow, "id"> & {
  id?: string;
};

export type QuizInsert = Omit<QuizRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type QuizQuestionInsert = Omit<QuizQuestionRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type QuizAttemptInsert = Omit<QuizAttemptRow, "id" | "completed_at"> & {
  id?: string;
  completed_at?: string;
};

export type ConversationInsert = {
  school_id: string;
  participant_id: string;
  other_user_id: string;
  role: string;
  last_message?: string | null;
};

export type ChatMessageInsert = {
  conversation_id: string;
  from_id?: string | null;
  from_name: string;
  text: string;
};

export type FriendsInsert = Omit<FriendsRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type SchoolFeedPostInsert = {
  school_id: string;
  tag: string;
  title: string;
  body: string;
  image_url?: string | null;
};

export type BannerConfigInsert = {
  school_id: string;
  image_url?: string | null;
  focal_y?: number;
};

export type FlorinBalanceInsert = {
  student_id: string;
  balance?: number;  
};

export type FlorinTransactionInsert = {
  school_id: string;
  student_id: string;
  amount: number;
  reason?: string | null;
};

// Payment system insert types
export type FlorinPackageInsert = {
  id: string;
  name: string;
  florin_amount: number;
  price_php: number;
  currency?: string;
  active?: boolean;
  sort_order?: number;
};

export type PaymentTransactionInsert = {
  student_id: string;
  school_id: string;
  package_id: string;
  florin_amount: number;
  amount_php: number;
  currency?: string;
  status?: 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired';
  provider?: string;
  provider_session_id?: string | null;
  provider_payment_id?: string | null;
  reference_number: string;
  failure_reason?: string | null;
};

export type ProcessedWebhookEventInsert = {
  provider: string;
  event_id: string;
  transaction_id?: string | null;
};


export type ProgramInsert = {
  school_id: string;
  name: string;
  description?: string | null;
};

export type SectionInsert = {
  school_id: string;
  program_id: string;
  name: string;
};

export type CourseInsert = {
  school_id: string;
  section_id: string;
  name: string;
  code?: string | null;
  teacher_id?: string | null;
};

export type CourseEnrollmentInsert = {
  school_id: string;
  course_id: string;
  student_id: string;
};

export type GradeEntryInsert = {
  school_id: string;
  course_id: string;
  student_id: string;
  submitted_by: string;
  type: "Exam" | "Quiz" | "Activity" | "Assignment";
  label?: string | null;
  score: number;
  entry_date?: string;
};

export type TeacherTaskInsert = {
  school_id: string;
  teacher_id: string;
  assigned_by: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  status?: "pending" | "accepted" | "declined" | "done";
  decline_reason?: string | null;
};

export interface NotificationRow {
  id: string;
  school_id: string;
  recipient_id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  cleared_at: string | null;
  created_at: string;
}

export interface StoryRow {
  id: string;
  school_id: string;
  user_id: string;
  image_path: string;
  caption: string | null;
  mention_ids: string[];
  created_at: string;
  expires_at: string;
  author_name: string | null;
  author_avatar: string | null;
}

export interface StoryViewRow {
  id: string;
  story_id: string;
  viewer_id: string;
  viewer_name: string | null;
  viewed_at: string;
}

export interface EnrollmentStatusRow {
  student_id: string;
  school_id: string;
  status: "enrolled" | "revoked";
  started_at: string;
  expires_at: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountRequestRow {
  id: string;
  school_id: string;
  requester_id: string;
  requester_name: string | null;
  requester_role: string | null;
  type: "deactivation" | "deletion";
  reason: string | null;
  status: "pending" | "approved" | "denied";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AccountAppealRow {
  id: string;
  school_id: string;
  user_id: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  /** Joined requester identity (admin review UI). */
  user_name?: string | null;
}

export interface FeedbackReportRow {
  id: string;
  school_id: string;
  user_id: string;
  page: string | null;
  message: string;
  attachment_paths: string[];
  created_at: string;
}

export interface StudentAchievementRow {
  id: string;
  student_id: string;
  school_id: string;
  title: string;
  school_year: string;
  date_awarded: string;
  school: string;
  image_path: string;
  created_at: string;
}

export type StudentAchievementInsert = {
  student_id: string;
  school_id: string;
  title: string;
  school_year: string;
  date_awarded: string;
  school: string;
  image_path: string;
};

export interface StudentMusicRow {
  id: string;
  student_id: string;
  school_id: string;
  music_url: string;
  platform: string;
  title: string;
  artist: string;
  album_cover_url: string | null;
  created_at: string;
}

export type StudentMusicInsert = {
  student_id: string;
  school_id: string;
  music_url: string;
  platform: string;
  title: string;
  artist: string;
  album_cover_url?: string | null;
};

export type NotificationInsert = Omit<NotificationRow, "id" | "created_at" | "actor_name" | "actor_avatar"> & {
  id?: string;
  created_at?: string;
};

export type StoryInsert = {
  school_id: string;
  user_id: string;
  image_path: string;
  caption?: string | null;
  mention_ids?: string[];
  expires_at?: string;
};

export type StoryViewInsert = {
  story_id: string;
  viewer_id: string;
};

export type EnrollmentStatusInsert = {
  student_id: string;
  school_id: string;
  status?: "enrolled" | "revoked";
  started_at?: string;
  expires_at?: string | null;
  updated_by?: string | null;
};

export type AccountRequestInsert = {
  school_id: string;
  requester_id: string;
  type: "deactivation" | "deletion";
  reason?: string | null;
};

// ============================================================================
// DATABASE TYPE DEFINITION
// ============================================================================

export interface Database {
  public: {
    Tables: {
      schools: {
        Row: SchoolRow;
        Insert: SchoolInsert;
        Update: Partial<Omit<SchoolRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: Partial<Omit<ProfileRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      learning_materials: {
        Row: LearningMaterialRow;
        Insert: LearningMaterialInsert;
        Update: Partial<Omit<LearningMaterialRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      library_books: {
        Row: LibraryBookRow;
        Insert: LibraryBookInsert;
        Update: Partial<Omit<LibraryBookRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      library_borrow_requests: {
        Row: LibraryBorrowRequestRow;
        Insert: LibraryBorrowRequestInsert;
        Update: Partial<Omit<LibraryBorrowRequestRow, "id" | "requested_at">> & {
          id?: string;
          requested_at?: string;
        };
      };
      library_borrow_log: {
        Row: LibraryBorrowLogRow;
        Insert: LibraryBorrowLogInsert;
        Update: Partial<Omit<LibraryBorrowLogRow, "id">> & {
          id?: string;
        };
      };
      quizzes: {
        Row: QuizRow;
        Insert: QuizInsert;
        Update: Partial<Omit<QuizRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      quiz_questions: {
        Row: QuizQuestionRow;
        Insert: QuizQuestionInsert;
        Update: Partial<Omit<QuizQuestionRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      quiz_attempts: {
        Row: QuizAttemptRow;
        Insert: QuizAttemptInsert;
        Update: Partial<Omit<QuizAttemptRow, "id" | "completed_at">> & {
          id?: string;
          completed_at?: string;
        };
      };
      conversations: {
        Row: ConversationRow;
        Insert: ConversationInsert;
        Update: Partial<Omit<ConversationRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      chat_messages: {
        Row: ChatMessageRow;
        Insert: ChatMessageInsert;
        Update: Partial<Omit<ChatMessageRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      friends: {
        Row: FriendsRow;
        Insert: FriendsInsert;
        Update: Partial<Omit<FriendsRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      school_feed_posts: {
        Row: SchoolFeedPostRow;
        Insert: SchoolFeedPostInsert;
        Update: Partial<Omit<SchoolFeedPostRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      banner_config: {
        Row: BannerConfigRow;
        Insert: BannerConfigInsert;
        Update: Partial<Omit<BannerConfigRow, "updated_at">> & {
          updated_at?: string;
        };
      };
      florin_balances: {
        Row: FlorinBalanceRow;
        Insert: FlorinBalanceInsert;
        Update: Partial<Omit<FlorinBalanceRow, "updated_at">> & {
          updated_at?: string;
        };
      };
      florin_transactions: {
        Row: FlorinTransactionRow;
        Insert: FlorinTransactionInsert;
        Update: Partial<Omit<FlorinTransactionRow, "id">> & {
          id?: string;
        };
      };
      florin_packages: {
        Row: FlorinPackageRow;
        Insert: FlorinPackageInsert;
        Update: Partial<Omit<FlorinPackageRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      payment_transactions: {
        Row: PaymentTransactionRow;
        Insert: PaymentTransactionInsert;
        Update: Partial<Omit<PaymentTransactionRow, "id" | "created_at" | "updated_at">> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      processed_webhook_events: {
        Row: ProcessedWebhookEventRow;
        Insert: ProcessedWebhookEventInsert;
        Update: Partial<Omit<ProcessedWebhookEventRow, "id" | "processed_at">> & {
          id?: string;
          processed_at?: string;
        };
      };
      programs: {
        Row: ProgramRow;
        Insert: ProgramInsert;
        Update: Partial<Omit<ProgramRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      sections: {
        Row: SectionRow;
        Insert: SectionInsert;
        Update: Partial<Omit<SectionRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      courses: {
        Row: CourseRow;
        Insert: CourseInsert;
        Update: Partial<Omit<CourseRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      course_enrollments: {
        Row: CourseEnrollmentRow;
        Insert: CourseEnrollmentInsert;
        Update: Partial<Omit<CourseEnrollmentRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      grade_entries: {
        Row: GradeEntryRow;
        Insert: GradeEntryInsert;
        Update: Partial<Omit<GradeEntryRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      teacher_tasks: {
        Row: TeacherTaskRow;
        Insert: TeacherTaskInsert;
        Update: Partial<Omit<TeacherTaskRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      notifications: {
        Row: NotificationRow;
        Insert: NotificationInsert;
        Update: Partial<Omit<NotificationRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      student_achievements: {
        Row: StudentAchievementRow;
        Insert: StudentAchievementInsert;
        Update: Partial<Omit<StudentAchievementRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      student_music: {
        Row: StudentMusicRow;
        Insert: StudentMusicInsert;
        Update: Partial<Omit<StudentMusicRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      stories: {
        Row: StoryRow;
        Insert: StoryInsert;
        Update: Partial<Omit<StoryRow, "id" | "created_at" | "author_name" | "author_avatar">> & {
          id?: string;
          created_at?: string;
        };
      };
      story_views: {
        Row: StoryViewRow;
        Insert: StoryViewInsert;
        Update: Partial<Omit<StoryViewRow, "id" | "viewed_at">> & {
          id?: string;
          viewed_at?: string;
        };
      };
      enrollment_status: {
        Row: EnrollmentStatusRow;
        Insert: EnrollmentStatusInsert;
        Update: Partial<Omit<EnrollmentStatusRow, "student_id" | "created_at">> & {
          student_id?: string;
          created_at?: string;
        };
      };
      account_requests: {
        Row: AccountRequestRow;
        Insert: AccountRequestInsert;
        Update: Partial<Omit<AccountRequestRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      account_appeals: {
        Row: AccountAppealRow;
        Insert: {
          school_id: string;
          user_id: string;
          reason: string;
        };
        Update: Partial<Omit<AccountAppealRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
      feedback_reports: {
        Row: FeedbackReportRow;
        Insert: {
          school_id: string;
          user_id: string;
          page?: string | null;
          message: string;
          attachment_paths?: string[];
        };
        Update: Partial<Omit<FeedbackReportRow, "id" | "created_at">> & {
          id?: string;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      Role: "student" | "teacher" | "admin";
    };
  };
}
