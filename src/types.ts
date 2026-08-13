export type ProcessStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type MatchType = 'OFFICIAL_WEBSITE' | 'FACEBOOK_FALLBACK' | 'NOT_FOUND' | 'UNPROCESSED';

export type ConfidenceScore = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type SweepStatus = 'SWEPT_FOUND' | 'SWEPT_NOT_FOUND' | 'UNSCREENED';



export interface GroundingSource {
  title: string;
  url: string;
}

export type DeepContactRoleHint =
  | 'OWNER'
  | 'MANAGING_DIRECTOR'
  | 'HR_MANAGER'
  | 'GENERAL_CONTACT'
  | 'OTHER';

export interface DeepContact {
  name: string | null;
  role: string | null;
  roleHint: DeepContactRoleHint;
  email: string | null;
  phone: string | null;
  sourceUrl: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// Result of a POST /api/extract-contacts call: contacts pulled directly off the
// company's own site (contact/about/team pages), kept separate from the
// Google-search-grounded fields above since it's a different data source.
export interface DeepContactResult {
  status: 'SUCCESS' | 'FAILED';
  error?: string;
  generalEmail: string | null;
  generalPhone: string | null;
  address: string | null;
  contacts: DeepContact[];
  pagesCrawled: string[];
  notes: string | null;
  extractedAt: string;
}

export interface CompanyRecord {
  id: string;
  companyNumber: string;
  companyName: string;
  county: string; // From Address4
  status: ProcessStatus;
  official_website_url: string | null;
  industry?: string | null;
  companySummary?: string | null;
  phoneNumber?: string | null;
  contactEmail?: string | null;
  decisionMakerName?: string | null;
  decisionMakerRole?: string | null;
  linkedinUrl?: string | null;
  linkedinType?: 'DECISION_MAKER' | 'COMPANY' | 'NOT_FOUND' | null;
  verificationStatus?: 'VERIFIED_ACTIVE' | 'VERIFIED_FACEBOOK' | 'UNVERIFIED' | 'UNPROCESSED';
  confidence_score: ConfidenceScore;
  match_type: MatchType;
  notes?: string;
  sweepStatus?: SweepStatus;
  
  
  grounding_sources?: GroundingSource[];
  processedAt?: string;
  isManualEdit?: boolean;
  estimatedSize?: string | null;
  icpRating?: number | null;
  reasonForPbsNeed?: string | null;
  deepContacts?: DeepContactResult | null;
  // Raw incoming file data for exact column sequence preservation
  rawRowData?: Record<string, any>;
  originalHeaders?: string[];
}

export interface BatchConfig {
  batchSize: number;
}

export interface FilterState {
  searchTerm: string;
  countyFilter: string;
  statusFilter: 'ALL' | 'PENDING' | 'SUCCESS' | 'FAILED';
  matchTypeFilter: 'ALL' | 'OFFICIAL_WEBSITE' | 'FACEBOOK_FALLBACK' | 'NOT_FOUND' | 'UNPROCESSED';
  confidenceFilter: 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
  showOnlySuccessful?: boolean;
}

export interface SummaryStats {
  total: number;
  processed: number;
  remaining: number;
  officialFound: number;
  facebookFallback: number;
  notFound: number;
  failed: number;
  officialPercentage: number;
}

