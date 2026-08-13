export interface ExtractContactsRequest {
  companyName?: string;
  url: string;
}

export interface CrawledPage {
  url: string;
  title: string;
  text: string;
}

export interface CrawlResult {
  startUrl: string;
  domain: string;
  pages: CrawledPage[];
}

export type ContactRoleHint =
  | "OWNER"
  | "MANAGING_DIRECTOR"
  | "HR_MANAGER"
  | "GENERAL_CONTACT"
  | "OTHER";

export interface ExtractedContact {
  name: string | null;
  role: string | null;
  roleHint: ContactRoleHint;
  email: string | null;
  phone: string | null;
  sourceUrl: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface ExtractedContactData {
  companyName: string | null;
  website: string;
  generalEmail: string | null;
  generalPhone: string | null;
  address: string | null;
  contacts: ExtractedContact[];
  pagesCrawled: string[];
  notes: string | null;
}

export interface ExtractContactsResponse extends ExtractedContactData {
  status: "SUCCESS" | "FAILED";
  error?: string;
}
