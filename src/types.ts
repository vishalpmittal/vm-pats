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
}
