export type ProcessStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type MatchType =
  | 'OFFICIAL_WEBSITE'
  | 'FACEBOOK_FALLBACK'
  | 'NOT_FOUND'
  | 'UNPROCESSED'
  | 'DISQUALIFIED'
  | 'LIGHT_SWEEP_COMPLETE'
  | 'SHARED_DOMAIN';

export type ConfidenceScore = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface GroundingSource {
  title: string;
  url: string;
}

export interface CompanyRecord {
  id: string;
  companyNumber: string;
  companyName: string;
  county: string; // From Address4
  eircode?: string | null;
  status: ProcessStatus;
  official_website_url: string | null;
  apexDomain?: string | null;
  tradingStatus?: 'TRADING' | 'DORMANT_OR_SHELL' | 'NOT_FOUND' | null;
  category?: string | null; // Light Sweep's coarse category, distinct from the deeper `industry` field below
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
  grounding_sources?: GroundingSource[];
  processedAt?: string;
  isManualEdit?: boolean;
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
  matchTypeFilter: 'ALL' | 'OFFICIAL_WEBSITE' | 'FACEBOOK_FALLBACK' | 'NOT_FOUND' | 'UNPROCESSED' | 'DISQUALIFIED' | 'LIGHT_SWEEP_COMPLETE' | 'SHARED_DOMAIN';
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

