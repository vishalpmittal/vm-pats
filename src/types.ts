export interface JobApplication {
  id: string;
  company: string;
  title: string;
  jobLink: string;
  location: string;
  postingDate: string;
  applicationDate: string;
  notes: string;
  hasAiReview?: boolean;
  referralName?: string;
  referralLinkedIn?: string;
  referralRelation?: string;
  referralContext?: string;
  addedDate?: string;
  jobDescription?: string;
  interviewDate?: string;
  recruiterName?: string;
  recruiterEmail?: string;
  recruiterLinkedIn?: string;
  hiringManagerName?: string;
  hiringManagerEmail?: string;
  hiringManagerLinkedIn?: string;
}
